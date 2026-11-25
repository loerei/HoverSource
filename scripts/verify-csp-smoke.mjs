import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const MAX_LOG_BYTES = 64 * 1024;
const STEP_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------
//  Worker mode for isolated child processes (companion-server / proxy)
// ---------------------------------------------------------------------------

async function runWorkerIfRequested() {
  const modeArg = process.argv.find((a) => a.startsWith("--worker="));
  if (!modeArg) return false;

  const mode = modeArg.slice("--worker=".length);
  if (mode === "companion") {
    const port = Number(process.argv[3]);
    const projectRoot = process.argv[4];
    const debugPort = Number(process.argv[5] || 0);
    const { startCompanionServer } = await import(
      new URL("../packages/companion-server/dist/server.js", import.meta.url).href
    );
    const server = startCompanionServer({ port, projectRoot, debugPort });
    const shutdown = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    return true;
  }

  if (mode === "proxy") {
    const targetUrl = process.argv[3];
    const proxyPort = Number(process.argv[4]);
    const companionPort = Number(process.argv[5]);
    const overlayScriptUrl = process.argv[6];
    const { startProxy } = await import(
      new URL("../packages/cli/dist/proxy.js", import.meta.url).href
    );
    await startProxy({
      targetUrl,
      proxyPort,
      companionPort,
      overlayScriptUrl,
      useHttps: false,
    });
    const shutdown = () => process.exit(0);
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    return true;
  }

  throw new Error(`Unknown worker mode: ${mode}`);
}

// ---------------------------------------------------------------------------
//  Utilities: assertions, bounded streams, polling, cleanup
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function appendClamped(current, chunk) {
  const next = current + chunk.toString("utf8");
  if (next.length <= MAX_LOG_BYTES) return next;
  return next.slice(next.length - MAX_LOG_BYTES);
}

async function waitForCondition(fn, description, timeoutMs = STEP_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const detail = lastErr ? ` (last error: ${lastErr.message})` : "";
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}${detail}`);
}

function httpRequest(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      let total = 0;
      res.on("data", (c) => {
        total += c.length;
        if (total <= MAX_LOG_BYTES) chunks.push(c);
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP GET ${url} timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
  });
}

function closeHttpServer(server) {
  return new Promise((resolve) => {
    try {
      server.closeAllConnections?.();
    } catch {
      // Ignore
    }
    const timer = setTimeout(resolve, 1000);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function removeDirWithRetry(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 150,
  });
}

async function terminateChild(child, name, cdpCloseFn) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exitPromise = new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
  try {
    if (cdpCloseFn) {
      await Promise.race([
        cdpCloseFn().catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  } catch {
    // Ignore kill errors
  }
  const grace = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore
      }
    }
  }, 2000);
  grace.unref();
  await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 3500))]);
  clearTimeout(grace);
  if (child.exitCode === null && child.signalCode === null) {
    console.warn(`[verify-csp-smoke] Warning: ${name} did not report exit within cleanup timeout.`);
  }
}

// ---------------------------------------------------------------------------
//  Chromium binary discovery & launch
// ---------------------------------------------------------------------------

function resolveChromiumBinary() {
  const envPath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [];
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env["LocalAppData"] || path.join(os.homedir(), "AppData", "Local");
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    for (const bin of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
      for (const dir of (process.env.PATH || "").split(path.delimiter)) {
        if (dir) candidates.push(path.join(dir, bin));
      }
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "No Chromium/Chrome/Edge binary found. Set CHROME_PATH or install Chrome/Edge."
  );
}

async function launchHeadlessChromium(userDataDir) {
  const binary = resolveChromiumBinary();
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--disable-default-apps",
    "about:blank",
  ];

  const child = spawn(binary, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => { stdout = appendClamped(stdout, d); });
  child.stderr?.on("data", (d) => { stderr = appendClamped(stderr, d); });

  const devToolsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Chromium DevTools endpoint.\nstderr:\n${stderr}`));
    }, STEP_TIMEOUT_MS);

    const checkReady = () => {
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (m) {
        clearTimeout(timer);
        clearInterval(portFilePoll);
        resolve(m[1]);
        return true;
      }
      const activePortFile = path.join(userDataDir, "DevToolsActivePort");
      if (fs.existsSync(activePortFile)) {
        try {
          const lines = fs.readFileSync(activePortFile, "utf8").trim().split(/\r?\n/);
          const port = Number(lines[0]);
          const wsPath = lines[1];
          if (port > 0 && wsPath) {
            clearTimeout(timer);
            clearInterval(portFilePoll);
            resolve(`ws://127.0.0.1:${port}${wsPath}`);
            return true;
          }
        } catch {
          // Retry on next poll
        }
      }
      return false;
    };

    const portFilePoll = setInterval(checkReady, 50);
    child.stderr?.on("data", checkReady);
    child.once("error", (err) => {
      clearTimeout(timer);
      clearInterval(portFilePoll);
      reject(err);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      clearInterval(portFilePoll);
      reject(new Error(`Chromium exited prematurely (code=${code}, signal=${signal}).\nstderr:\n${stderr}`));
    });
  });

  const parsed = new URL(devToolsUrl);
  return {
    child,
    cdpPort: Number(parsed.port),
    browserWsUrl: devToolsUrl,
    getLogs: () => ({ stdout, stderr }),
  };
}

// ---------------------------------------------------------------------------
//  Minimal CDP WebSocket client using built-in globalThis.WebSocket
// ---------------------------------------------------------------------------

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  async connect(timeoutMs = 5000) {
    this.ws = new globalThis.WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP WebSocket connect timed out: ${this.wsUrl}`));
      }, timeoutMs);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", (ev) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error on ${this.wsUrl}: ${ev?.message || "unknown"}`));
      }, { once: true });
    });

    this.ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(`CDP ${p.method} failed: ${msg.error.message}`));
          } else {
            p.resolve(msg.result ?? {});
          }
        }
      } else if (msg.method) {
        const listeners = this.eventListeners.get(msg.method);
        if (listeners) {
          for (const fn of listeners) {
            try {
              fn(msg.params ?? {});
            } catch {
              // Ignore listener errors
            }
          }
        }
      }
    });

    this.ws.addEventListener("close", () => {
      for (const [, p] of this.pending) {
        p.reject(new Error(`CDP WebSocket closed while waiting for ${p.method}`));
      }
      this.pending.clear();
    });
  }

  on(method, fn) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, new Set());
    }
    this.eventListeners.get(method).add(fn);
  }

  send(method, params = {}, timeoutMs = 10_000) {
    if (!this.ws || this.ws.readyState !== globalThis.WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP WebSocket is not open for ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJson(expression, timeoutMs = 10_000) {
    const res = await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      timeoutMs
    );
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Runtime.evaluate exception: ${desc}`);
    }
    return res.result?.value;
  }

  async close() {
    if (!this.ws) return;
    if (this.ws.readyState === globalThis.WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      timer.unref();
      this.ws.addEventListener("close", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      try {
        this.ws.close();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

async function withDedicatedTab(browserClient, cdpPort, fn) {
  const { targetId } = await browserClient.send("Target.createTarget", { url: "about:blank" });
  const targetsRes = await httpRequest(`http://127.0.0.1:${cdpPort}/json`);
  const targets = JSON.parse(targetsRes.body);
  const target = targets.find((t) => t.id === targetId);
  assert(target && target.webSocketDebuggerUrl, `Target ${targetId} missing webSocketDebuggerUrl`);

  const pageClient = new CdpClient(target.webSocketDebuggerUrl);
  await pageClient.connect();
  try {
    return await fn(pageClient, targetId);
  } finally {
    await pageClient.close().catch(() => {});
    await browserClient.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
//  Child process launchers for companion-server & proxy
// ---------------------------------------------------------------------------

async function startCompanionChild(port, projectRoot, cdpPort, tempHomeDir) {
  const child = spawn(
    process.execPath,
    [__filename, "--worker=companion", String(port), projectRoot, String(cdpPort)],
    {
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        HOME: tempHomeDir,
        USERPROFILE: tempHomeDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => { stdout = appendClamped(stdout, d); });
  child.stderr?.on("data", (d) => { stderr = appendClamped(stderr, d); });

  let exited = false;
  let exitInfo = "";
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = `code=${code}, signal=${signal}`;
  });
  child.once("error", (err) => {
    exited = true;
    exitInfo = err.message;
  });

  await waitForCondition(async () => {
    if (exited) {
      throw new Error(`Companion server child exited early (${exitInfo}).\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    try {
      const res = await httpRequest(`http://127.0.0.1:${port}/ping`, 1000);
      return res.statusCode === 200 && res.body.trim() === "pong";
    } catch {
      return false;
    }
  }, `companion server /ping on port ${port}`);

  return child;
}

async function startProxyChild(targetUrl, proxyPort, companionPort, overlayScriptUrl) {
  const child = spawn(
    process.execPath,
    [__filename, "--worker=proxy", targetUrl, String(proxyPort), String(companionPort), overlayScriptUrl],
    {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => { stdout = appendClamped(stdout, d); });
  child.stderr?.on("data", (d) => { stderr = appendClamped(stderr, d); });

  let exited = false;
  let exitInfo = "";
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = `code=${code}, signal=${signal}`;
  });
  child.once("error", (err) => {
    exited = true;
    exitInfo = err.message;
  });

  await waitForCondition(async () => {
    if (exited) {
      throw new Error(`Proxy child exited early (${exitInfo}).\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    try {
      const res = await httpRequest(`http://127.0.0.1:${proxyPort}/hoversource/ping`, 1000);
      return res.statusCode === 200 && res.body.trim() === "pong";
    } catch {
      return false;
    }
  }, `proxy /hoversource/ping on port ${proxyPort}`);

  return child;
}

// ---------------------------------------------------------------------------
//  Checks (a), (b), (c)
// ---------------------------------------------------------------------------

function attachPageErrorCollector(pageClient) {
  const errors = [];
  const cspOrTrustedRegex = /TrustedHTML|TrustedScript|Content Security Policy|Refused to|appendChild|NotAllowedError/i;

  pageClient.on("Runtime.exceptionThrown", (params) => {
    const text =
      params.exceptionDetails?.exception?.description ||
      params.exceptionDetails?.text ||
      "Unknown exception";
    errors.push(`exceptionThrown: ${text}`);
  });

  pageClient.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      const msg = (params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      errors.push(`console.error: ${msg}`);
    }
  });

  pageClient.on("Log.entryAdded", (params) => {
    const entry = params.entry;
    if (entry?.level === "error" || cspOrTrustedRegex.test(entry?.text || "")) {
      errors.push(`log(${entry.level}): ${entry.text}`);
    }
  });

  return { errors, cspOrTrustedRegex };
}

async function runCheckA({ browserClient, cdpPort, companionPort, bundleContent }) {
  console.log("[verify-csp-smoke] Running Check (a): Strict non-bypassed Trusted Types + connect-src 'none' + Shadow DOM...");
  const cspHeader =
    "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; require-trusted-types-for 'script'";

  const server = http.createServer((req, res) => {
    if (req.url === "/bootstrap.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(`globalThis.__HOVERSOURCE_PORT__ = ${companionPort};\n`);
      return;
    }
    if (req.url === "/overlay.bundle.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(bundleContent);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": cspHeader,
    });
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { all: unset; }
      div { color: red !important; }
      #target-box {
        display: block;
        width: 240px;
        height: 80px;
        margin: 40px;
        background: #222;
        color: #fff;
      }
    </style>
    <script src="/bootstrap.js"></script>
    <script src="/overlay.bundle.js"></script>
  </head>
  <body>
    <div id="target-box" data-hs-source="src/Demo.tsx:2:1">HoverSource Smoke Target</div>
  </body>
</html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const targetPort = server.address().port;

  try {
    await withDedicatedTab(browserClient, cdpPort, async (pageClient) => {
      await pageClient.send("Page.enable");
      await pageClient.send("Runtime.enable");
      await pageClient.send("Log.enable");
      await pageClient.send("Page.bringToFront");
      await browserClient.send("Browser.grantPermissions", {
        origin: `http://127.0.0.1:${targetPort}`,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });

      const { errors, cspOrTrustedRegex } = attachPageErrorCollector(pageClient);
      const bridgeRequests = [];

      await pageClient.send("Runtime.addBinding", { name: "__hoversourceBridgeCall" });
      pageClient.on("Runtime.bindingCalled", async (params) => {
        if (params.name !== "__hoversourceBridgeCall") return;
        let payload;
        try {
          payload = JSON.parse(params.payload);
        } catch {
          return;
        }
        bridgeRequests.push(payload.path);
        try {
          const upstream = await httpRequest(`http://127.0.0.1:${companionPort}${payload.path}`, 5000);
          if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
            await pageClient.send("Runtime.evaluate", {
              contextId: params.executionContextId,
              expression: `globalThis.__hoversourceBridgeResolve?.(${JSON.stringify(payload.id)}, ${JSON.stringify(upstream.body)})`,
            });
          } else {
            await pageClient.send("Runtime.evaluate", {
              contextId: params.executionContextId,
              expression: `globalThis.__hoversourceBridgeReject?.(${JSON.stringify(payload.id)}, ${JSON.stringify(`HTTP ${upstream.statusCode}`)})`,
            });
          }
        } catch (err) {
          await pageClient.send("Runtime.evaluate", {
            contextId: params.executionContextId,
            expression: `globalThis.__hoversourceBridgeReject?.(${JSON.stringify(payload.id)}, ${JSON.stringify(err.message)})`,
          }).catch(() => {});
        }
      });

      const loadDone = new Promise((resolve) => {
        pageClient.on("Page.loadEventFired", () => resolve());
      });
      await pageClient.send("Page.navigate", { url: `http://127.0.0.1:${targetPort}/` });
      await Promise.race([
        loadDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Page.navigate load timeout")), STEP_TIMEOUT_MS)),
      ]);

      await waitForCondition(async () => {
        return pageClient.evalJson(`(() => {
          const host = document.getElementById("hoversource-host");
          return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector(".hoversource-container"));
        })()`);
      }, "#hoversource-host and shadowRoot mounting");

      const rect = await pageClient.evalJson(`(() => {
        const el = document.getElementById("target-box");
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);

      await pageClient.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: rect.x,
        y: rect.y,
      });

      const tooltipState = await waitForCondition(async () => {
        return pageClient.evalJson(`(() => {
          const sr = document.getElementById("hoversource-host")?.shadowRoot;
          if (!sr) return null;
          const tip = sr.querySelector(".hoversource-tooltip");
          const link = sr.querySelector(".hoversource-link");
          if (!tip || !link) return null;
          const tipStyle = getComputedStyle(tip);
          if (tipStyle.display === "none") return null;
          return {
            tipColor: tipStyle.color,
            linkText: link.textContent,
          };
        })()`);
      }, ".hoversource-tooltip and .hoversource-link visibility");

      assert(tooltipState.tipColor !== "rgb(255, 0, 0)", `Shadow DOM failed to resist host CSS reset (got color ${tooltipState.tipColor})`);
      assert(bridgeRequests.some((p) => p === "/config"), "Expected /config over __hoversourceBridgeCall");
      assert(bridgeRequests.some((p) => p.startsWith("/validate-line?")), "Expected /validate-line over __hoversourceBridgeCall");

      // Toggle filter panel (Alt+Ctrl+D)
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 3,
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      });
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 3,
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      });
      await waitForCondition(async () => {
        return pageClient.evalJson(`(() => {
          const panel = document.getElementById("hoversource-host")?.shadowRoot?.querySelector(".hoversource-config-panel");
          return panel ? getComputedStyle(panel).display === "block" : false;
        })()`);
      }, ".hoversource-config-panel display === block");

      // Close filter panel (Alt+Ctrl+D)
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 3,
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      });
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 3,
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      });

      // Trigger clipboard copy (Alt+C)
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 1,
        key: "c",
        code: "KeyC",
        windowsVirtualKeyCode: 67,
      });
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 1,
        key: "c",
        code: "KeyC",
        windowsVirtualKeyCode: 67,
      });
      await waitForCondition(async () => {
        return pageClient.evalJson(`(() => {
          const hint = document.getElementById("hoversource-host")?.shadowRoot?.querySelector(".hoversource-shortcut-hint");
          return Boolean(hint && hint.textContent && hint.textContent.includes("Copied successfully for AI!"));
        })()`);
      }, '"Copied successfully for AI!" in .hoversource-shortcut-hint');

      // Toggle freeze mode (Alt+P)
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 1,
        key: "p",
        code: "KeyP",
        windowsVirtualKeyCode: 80,
      });
      await pageClient.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 1,
        key: "p",
        code: "KeyP",
        windowsVirtualKeyCode: 80,
      });
      const freezeState = await waitForCondition(async () => {
        return pageClient.evalJson(`(() => {
          const freezeStyle = document.getElementById("hoversource-freeze-styles");
          const host = document.getElementById("hoversource-host");
          const tip = host?.shadowRoot?.querySelector(".hoversource-tooltip");
          if (!freezeStyle || !host || !tip) return null;
          return {
            hostPointerEvents: getComputedStyle(host).pointerEvents,
            tipPointerEvents: getComputedStyle(tip).pointerEvents,
          };
        })()`);
      }, "#hoversource-freeze-styles and freeze pointer-events");

      assert(freezeState.hostPointerEvents === "none", `Expected #hoversource-host pointer-events === "none", got ${freezeState.hostPointerEvents}`);
      assert(freezeState.tipPointerEvents === "auto", `Expected .hoversource-tooltip pointer-events === "auto", got ${freezeState.tipPointerEvents}`);

      const badErrors = errors.filter((e) => cspOrTrustedRegex.test(e) || e.startsWith("exceptionThrown:"));
      assert(badErrors.length === 0, `Unexpected page/CSP errors in Check (a): ${badErrors.join(" | ")}`);

      const fetchBlocked = await pageClient.evalJson(`(async () => {
        try {
          await fetch("/config");
          return { blocked: false };
        } catch (err) {
          return { blocked: true, name: err?.name, message: err?.message };
        }
      })()`);
      assert(fetchBlocked?.blocked === true && fetchBlocked?.name === "TypeError", `Expected fetch('/config') to fail with TypeError under connect-src 'none', got ${JSON.stringify(fetchBlocked)}`);
    });
  } finally {
    await closeHttpServer(server);
  }
  console.log("[verify-csp-smoke] Check (a) PASSED");
}

async function runCheckB({ browserClient, cdpPort, companionPort, bundleContent }) {
  console.log("[verify-csp-smoke] Running Check (b): client-injector pre-<body> CDP lifecycle...");
  const { injectOverlayScript, closeAllCdpSessions } = await import(
    new URL("../packages/client-injector/dist/injector.js", import.meta.url).href
  );

  const cspHeader =
    "default-src 'self'; connect-src 'none'; require-trusted-types-for 'script'";
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": cspHeader,
    });
    res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <div id="b-target" data-hs-source="src/Demo.tsx:2:1">Check B Target</div>
  </body>
</html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const targetPort = server.address().port;

  try {
    await withDedicatedTab(browserClient, cdpPort, async (pageClient) => {
      await pageClient.send("Page.enable");
      await pageClient.send("Runtime.enable");
      const { errors, cspOrTrustedRegex } = attachPageErrorCollector(pageClient);

      let configLoadedLogged = false;
      pageClient.on("Runtime.consoleAPICalled", (params) => {
        const text = (params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
        if (text.includes("Configuration loaded from companion server:")) {
          configLoadedLogged = true;
        }
      });

      const firstLoad = new Promise((resolve) => {
        pageClient.on("Page.loadEventFired", () => resolve());
      });
      await pageClient.send("Page.navigate", { url: `http://127.0.0.1:${targetPort}/` });
      await Promise.race([
        firstLoad,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Check B initial navigate timeout")), STEP_TIMEOUT_MS)),
      ]);

      const scriptWithPort = `globalThis.__HOVERSOURCE_PORT__ = ${companionPort};\n` + bundleContent;
      const injectedCount = await injectOverlayScript(cdpPort, scriptWithPort, { companionPort });
      assert(injectedCount >= 1, `Expected injectOverlayScript to inject >= 1 target, got ${injectedCount}`);

      configLoadedLogged = false;
      const reloadDone = new Promise((resolve) => {
        pageClient.on("Page.loadEventFired", () => resolve());
      });
      await pageClient.send("Page.reload");
      await Promise.race([
        reloadDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Check B reload timeout")), STEP_TIMEOUT_MS)),
      ]);

      await waitForCondition(async () => {
        const mounted = await pageClient.evalJson(`Boolean(document.getElementById("hoversource-host")?.shadowRoot)`);
        return mounted && configLoadedLogged;
      }, "Check (b) pre-<body> mount + /config bridge round-trip after reload");

      const badErrors = errors.filter((e) => cspOrTrustedRegex.test(e) || e.startsWith("exceptionThrown:"));
      assert(badErrors.length === 0, `Unexpected page/CSP errors in Check (b): ${badErrors.join(" | ")}`);
    });
  } finally {
    closeAllCdpSessions();
    await closeHttpServer(server);
  }
  console.log("[verify-csp-smoke] Check (b) PASSED");
}

async function runCheckC({ browserClient, cdpPort, companionPort, findFreePort }) {
  console.log("[verify-csp-smoke] Running Check (c): Web Reverse Proxy <meta> CSP stripping...");
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; require-trusted-types-for 'script'">
  </head>
  <body>
    <div id="c-target" data-hs-source="src/Demo.tsx:2:1">Check C Proxy Target</div>
  </body>
</html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const targetPort = server.address().port;
  const proxyPort = await findFreePort(17400, [companionPort, targetPort]);
  const proxyChild = await startProxyChild(
    `http://127.0.0.1:${targetPort}`,
    proxyPort,
    companionPort,
    "/hoversource/hoversource-overlay.js"
  );

  try {
    await withDedicatedTab(browserClient, cdpPort, async (pageClient) => {
      await pageClient.send("Page.enable");
      await pageClient.send("Runtime.enable");
      const { errors, cspOrTrustedRegex } = attachPageErrorCollector(pageClient);

      const loadDone = new Promise((resolve) => {
        pageClient.on("Page.loadEventFired", () => resolve());
      });
      await pageClient.send("Page.navigate", { url: `http://127.0.0.1:${proxyPort}/` });
      await Promise.race([
        loadDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Check C navigate timeout")), STEP_TIMEOUT_MS)),
      ]);

      await waitForCondition(async () => {
        return pageClient.evalJson(`Boolean(document.getElementById("hoversource-host")?.shadowRoot)`);
      }, "Check (c) overlay mount via proxy");

      const metaCount = await pageClient.evalJson(
        `document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').length`
      );
      assert(metaCount === 0, `Expected 0 <meta http-equiv="Content-Security-Policy"> tags, found ${metaCount}`);

      const configFetch = await pageClient.evalJson(`(async () => {
        const r = await fetch("/hoversource/config");
        return { ok: r.ok, status: r.status };
      })()`);
      assert(configFetch?.ok === true && configFetch?.status === 200, `Expected /hoversource/config 200, got ${JSON.stringify(configFetch)}`);

      const badErrors = errors.filter((e) => cspOrTrustedRegex.test(e) || e.startsWith("exceptionThrown:"));
      assert(badErrors.length === 0, `Unexpected page/CSP errors in Check (c): ${badErrors.join(" | ")}`);
    });
  } finally {
    await terminateChild(proxyChild, "proxy");
    await closeHttpServer(server);
  }
  console.log("[verify-csp-smoke] Check (c) PASSED");
}

// ---------------------------------------------------------------------------
//  Main orchestrator
// ---------------------------------------------------------------------------

async function main() {
  if (await runWorkerIfRequested()) return;

  const bundlePath = path.join(REPO_ROOT, "packages", "overlay-core", "dist", "overlay.bundle.js");
  assert(fs.existsSync(bundlePath), `Missing built bundle at ${bundlePath} — run pnpm build first`);
  const bundleContent = fs.readFileSync(bundlePath, "utf8");

  const { findFreePort } = await import(
    new URL("../packages/cli/dist/port.js", import.meta.url).href
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hs-csp-smoke-"));
  const userDataDir = path.join(tempRoot, "chromium-profile");
  const tempHomeDir = path.join(tempRoot, "home");
  const projectRoot = path.join(tempRoot, "fixture-project");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempHomeDir, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "src", "Demo.tsx"),
    "export function Demo() {\n  return <div>Demo</div>;\n}\n",
    "utf8"
  );

  let browser = null;
  let browserClient = null;
  let companionChild = null;

  const cleanup = async () => {
    await terminateChild(companionChild, "companion-server");
    companionChild = null;
    if (browser) {
      await terminateChild(
        browser.child,
        "chromium",
        browserClient ? () => browserClient.send("Browser.close", {}, 1500) : undefined
      );
      browser = null;
    }
    if (browserClient) {
      await browserClient.close().catch(() => {});
      browserClient = null;
    }
    removeDirWithRetry(tempRoot);
  };

  const onSignal = (sig) => {
    cleanup()
      .catch(() => {})
      .finally(() => process.exit(sig === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    browser = await launchHeadlessChromium(userDataDir);
    browserClient = new CdpClient(browser.browserWsUrl);
    await browserClient.connect();

    const companionPort = await findFreePort(17300);
    companionChild = await startCompanionChild(companionPort, projectRoot, browser.cdpPort, tempHomeDir);

    await runCheckA({ browserClient, cdpPort: browser.cdpPort, companionPort, bundleContent });
    await runCheckB({ browserClient, cdpPort: browser.cdpPort, companionPort, bundleContent });
    await runCheckC({ browserClient, cdpPort: browser.cdpPort, companionPort, findFreePort });

    console.log("[verify-csp-smoke] All 3 headless Chromium CSP / Trusted Types / Shadow DOM checks PASSED.");
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await cleanup();
  }
}

main().catch((err) => {
  console.error("[verify-csp-smoke] FAILED:", err);
  process.exit(1);
});
