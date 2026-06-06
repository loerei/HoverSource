#!/usr/bin/env node

import { startCompanionServer, loadMergedConfig } from "@hoversource/companion-server";
import { injectOverlayScript } from "@hoversource/client-injector";
import { startProxy } from "./proxy.js";
import { exec, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import readline from "node:readline";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse arguments
function getArgs() {
  const args: Record<string, string | boolean> = {};
  let subcommand: string | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        args[key] = value;
      } else {
        // boolean flag
        args[arg.slice(2)] = true;
      }
    } else if (arg.startsWith("-")) {
      const char = arg.slice(1);
      if (char === "d") {
        args["dashboard"] = true;
      }
    } else if (!subcommand) {
      subcommand = arg; // e.g. "start", "dev"
    }
  }
  return { args, subcommand };
}

/**
 * If a subcommand like "start" or "dev" is given, resolve it to an exec
 * command by reading the project's package.json. Returns undefined if the
 * script doesn't exist, along with whether the project appears to be Electron.
 */
function resolveSubcommand(
  subcommand: string,
  projectRoot: string
): { execCommand: string; isElectron: boolean } | undefined {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error(`[HoverSource] No package.json found in ${projectRoot}`);
    return undefined;
  }

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    console.error(`[HoverSource] Failed to parse package.json`);
    return undefined;
  }

  const scripts: Record<string, string> = pkg.scripts || {};
  if (!scripts[subcommand]) {
    const available = Object.keys(scripts).join(", ");
    console.error(`[HoverSource] Script "${subcommand}" not found in package.json.`);
    if (available) console.error(`[HoverSource] Available scripts: ${available}`);
    return undefined;
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const isElectron = "electron" in allDeps;

  return { execCommand: `npm run ${subcommand}`, isElectron };
}

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(findFreePort(startPort + 1)));
  });
}

/**
 * If the requested port is occupied by another HoverSource instance, tell it
 * to shut down and wait for the port to free up so we can reuse it.
 * Returns the port we should actually bind to.
 */
async function resolveCompanionPort(requestedPort: number): Promise<number> {
  // Try to bind immediately — port is free
  const free = await new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.listen(requestedPort, "127.0.0.1", () => { probe.close(() => resolve(true)); });
    probe.on("error", () => resolve(false));
  });
  if (free) return requestedPort;

  // Port taken — check if it's an HS companion
  const isHs = await new Promise<boolean>((resolve) => {
    const req = http.get(`http://127.0.0.1:${requestedPort}/ping`, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => resolve(body.trim() === "pong"));
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });

  if (isHs) {
    console.log(`[HoverSource] Previous instance found on port ${requestedPort}. Taking over...`);
    await new Promise<void>((resolve) => {
      const req = http.get(`http://127.0.0.1:${requestedPort}/shutdown`, () => resolve());
      req.setTimeout(1500, () => {
        req.destroy();
        resolve();
      });
      req.on("error", () => resolve());
    });
    // Wait for the port to free up
    await new Promise((r) => setTimeout(r, 700));

    // Double check if the port was successfully freed
    const isNowFree = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.listen(requestedPort, "127.0.0.1", () => { probe.close(() => resolve(true)); });
      probe.on("error", () => resolve(false));
    });

    if (isNowFree) {
      return requestedPort;
    } else {
      console.log(`[HoverSource] Previous instance on port ${requestedPort} could not be terminated (ghost port).`);
    }
  }

  // Something else owns this port — find the next free one
  console.log(`[HoverSource] Port ${requestedPort} in use by another process, using ${requestedPort + 1}.`);
  return findFreePort(requestedPort + 1);
}

function openBrowser(url: string) {
  const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const command = process.platform === "win32" ? `start "" "${url}"` : `${startCmd} "${url}"`;
  exec(command, (err) => {
    if (err) {
      console.error(`[HoverSource] Failed to automatically open dashboard in browser: ${err.message}`);
    }
  });
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

function getPidUsingPort(port: number): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.includes("LISTENING")) {
            const parts = line.trim().split(/\s+/);
            const pidStr = parts[parts.length - 1];
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid) && pid > 0) {
              return resolve(pid);
            }
          }
        }
        resolve(undefined);
      });
    } else {
      exec(`lsof -t -i:${port}`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        const pid = parseInt(stdout.trim(), 10);
        if (!isNaN(pid) && pid > 0) {
          resolve(pid);
        } else {
          resolve(undefined);
        }
      });
    }
  });
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

function getProcessName(pid: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        if (stdout.includes("No tasks are running")) {
          return resolve(undefined);
        }
        const parts = stdout.trim().split(",");
        if (parts[0]) {
          const name = parts[0].replace(/"/g, "");
          return resolve(name);
        }
        resolve(undefined);
      });
    } else {
      exec(`ps -p ${pid} -o comm=`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        resolve(stdout.trim());
      });
    }
  });
}

function killProcess(pid: number, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
    exec(cmd, (err, stdout, stderr) => {
      if (!err) {
        // Normal kill reported success, but let's double check the port is free
        let checks = 0;
        const checkInterval = setInterval(async () => {
          const free = await isPortFree(port);
          checks++;
          if (free) {
            clearInterval(checkInterval);
            resolve(true);
          } else if (checks > 10) {
            clearInterval(checkInterval);
            console.error(`[HoverSource] Normal kill reported success but port is still occupied.`);
            if (stderr) console.error(`[HoverSource] Details: ${stderr.trim()}`);
            resolve(false);
          }
        }, 200);
        return;
      }

      // If failed on Windows, try elevating with UAC
      if (process.platform === "win32") {
        console.log(`[HoverSource] Normal termination failed. Requesting Administrator elevation (UAC)...`);
        const tempFile = path.join(os.tmpdir(), `hs_taskkill_${pid}.log`);
        if (fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch {}
        }

        const elevatorCmd = String.raw`powershell -Command "Start-Process cmd.exe -ArgumentList '/c taskkill /F /PID ${pid} > \"${tempFile}\" 2>&1' -Verb RunAs -WindowStyle Hidden"`;
        exec(elevatorCmd, (elevatorErr) => {
          if (elevatorErr) {
            console.error(`[HoverSource] UAC request canceled or failed: ${elevatorErr.message}`);
            resolve(false);
          } else {
            // Poll the port to see if it frees up
            let checks = 0;
            const checkInterval = setInterval(async () => {
              const free = await isPortFree(port);
              checks++;
              if (free) {
                clearInterval(checkInterval);
                try { fs.unlinkSync(tempFile); } catch {}
                resolve(true);
              } else if (checks > 20) { // 4 seconds total
                clearInterval(checkInterval);
                
                // Read temp file for failure reasons
                let errorDetails = "";
                if (fs.existsSync(tempFile)) {
                  try {
                    errorDetails = fs.readFileSync(tempFile, "utf-8").trim();
                    fs.unlinkSync(tempFile);
                  } catch {}
                }

                if (errorDetails) {
                  console.error(`\x1b[31m[HoverSource] UAC Taskkill failed: ${errorDetails}\x1b[0m`);
                } else {
                  console.error(`\x1b[31m[HoverSource] UAC Taskkill failed or was canceled by the user.\x1b[0m`);
                }
                resolve(false);
              }
            }, 200);
          }
        });
      } else {
        if (stderr) console.error(`[HoverSource] Details: ${stderr.trim()}`);
        resolve(false);
      }
    });
  });
}

const PATCH_STATE_FILE = path.join(os.tmpdir(), "hoversource_patches.json");

function recordPatchState(filePath: string, originalContent: string) {
  let state: Record<string, string> = {};
  if (fs.existsSync(PATCH_STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8"));
    } catch {}
  }
  state[filePath] = originalContent;
  try {
    fs.writeFileSync(PATCH_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

function removePatchState(filePath: string) {
  if (!fs.existsSync(PATCH_STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8"));
    delete state[filePath];
    if (Object.keys(state).length === 0) {
      fs.unlinkSync(PATCH_STATE_FILE);
    } else {
      fs.writeFileSync(PATCH_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    }
  } catch {}
}

function restoreLeftoverPatches() {
  if (!fs.existsSync(PATCH_STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8"));
    for (const [filePath, originalContent] of Object.entries(state)) {
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, originalContent as string, "utf-8");
        console.log(`[HoverSource] [Self-Healing] Restored leftover patch in ${filePath}`);
      }
    }
    fs.unlinkSync(PATCH_STATE_FILE);
  } catch {}
}

function findAndPatchDebugPort(projectRoot: string, oldPort: number, newPort: number): { restore: () => void } | undefined {
  const dirsToSearch = [
    path.join(projectRoot, "scripts"),
    projectRoot
  ];

  const patchedFiles: { path: string; originalContent: string }[] = [];

  for (const dir of dirsToSearch) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".ts") || file.endsWith(".json"))) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const searchStr = `--remote-debugging-port=${oldPort}`;
          if (content.includes(searchStr)) {
            const newContent = content.replace(new RegExp(searchStr, "g"), `--remote-debugging-port=${newPort}`);
            fs.writeFileSync(fullPath, newContent, "utf-8");
            recordPatchState(fullPath, content);
            patchedFiles.push({ path: fullPath, originalContent: content });
            console.log(`[HoverSource] Temporarily patched debug port ${oldPort} -> ${newPort} in ${path.relative(projectRoot, fullPath)}`);
          }
        } catch {}
      }
    }
  }

  if (patchedFiles.length === 0) return undefined;

  return {
    restore: () => {
      for (const pf of patchedFiles) {
        try {
          fs.writeFileSync(pf.path, pf.originalContent, "utf-8");
          removePatchState(pf.path);
          console.log(`[HoverSource] Restored original port configuration in ${path.relative(projectRoot, pf.path)}`);
        } catch {}
      }
    }
  };
}

async function main() {
  // Self-heal any leftover patches from previous crashed/force-killed runs
  restoreLeftoverPatches();

  const { args, subcommand } = getArgs();
  const projectRoot = path.resolve((args.root as string) || process.cwd());
  const config = loadMergedConfig(projectRoot);
  const autoResolve = config.autoResolvePortConflicts === true;
  
  const requestedPort = parseInt((args.port as string) || process.env.HOVERSOURCE_PORT || "3000", 10);
  const serverPort = await resolveCompanionPort(requestedPort);
  if (serverPort === requestedPort) {
    // Took over or was free — no message needed
  }
  let debugPort = parseInt((args["debug-port"] as string) || process.env.HOVERSOURCE_DEBUG_PORT || "9222", 10);
  const shouldOpenDashboard = !!args.dashboard;
  const targetUrl = args.target as string | undefined;
  let execCommand = args.exec as string | undefined;

  let patchRestorer: (() => void) | undefined;
  const cleanup = () => {
    if (patchRestorer) {
      try {
        patchRestorer();
        patchRestorer = undefined;
      } catch {}
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // Resolve subcommand (e.g. "hs start" → "npm run start")
  if (subcommand && !execCommand && !targetUrl) {
    const resolved = resolveSubcommand(subcommand, projectRoot);
    if (!resolved) { process.exit(1); }
    execCommand = resolved.execCommand;
    if (resolved.isElectron) {
      console.log(`[HoverSource] Detected Electron project, using exec mode.`);
    }
  }

  console.log(`[HoverSource] Initializing...`);

  // If in exec mode, check if the debugPort is already occupied and warn/prompt the user
  if (execCommand) {
    let isDebugPortInUse = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(true));
      server.once("listening", () => {
        server.close();
        resolve(false);
      });
      server.listen(debugPort, "127.0.0.1");
    });
    if (isDebugPortInUse) {
      const pid = await getPidUsingPort(debugPort);
      const procName = pid ? await getProcessName(pid) : undefined;

      console.warn(`\n\x1b[33m[HoverSource] ⚠️  WARNING: Debug port ${debugPort} is already in use by another process!\x1b[0m`);
      if (pid) {
        console.warn(`\x1b[33m[HoverSource] Process: ${procName || "Unknown"} (PID: ${pid})\x1b[0m`);
      } else {
        console.warn(`\x1b[33m[HoverSource] Could not identify the process holding the port.\x1b[0m`);
      }
      console.warn(`\x1b[33m[HoverSource] Electron will fail to bind to it, and the HoverSource overlay will not appear.\x1b[0m`);

      const isInteractive = (process.stdout.isTTY && process.stdin.isTTY) || autoResolve;
      if (isInteractive && pid) {
        let shouldKill = autoResolve;
        if (!shouldKill) {
          const answer = await askQuestion(`\x1b[36m[HoverSource] Would you like to terminate this process to free port ${debugPort}? (y/N): \x1b[0m`);
          shouldKill = answer.trim().toLowerCase() === "y";
        } else {
          console.log(`[HoverSource] autoResolvePortConflicts is enabled. Automatically terminating process ${pid}...`);
        }

        if (shouldKill) {
          console.log(`[HoverSource] Terminating process ${pid}...`);
          const success = await killProcess(pid, debugPort);
          if (success) {
            console.log(`[HoverSource] Process terminated successfully. Port ${debugPort} is now free.`);
            isDebugPortInUse = false;
            // Wait a brief moment for OS to release the socket
            await new Promise((r) => setTimeout(r, 700));
          } else {
            console.error(`[HoverSource] Failed to terminate process. You may need to run as administrator or close it manually.`);
          }
        }
      }

      if (isDebugPortInUse && isInteractive) {
        let shouldPatch = autoResolve;
        if (!shouldPatch) {
          const portAnswer = await askQuestion(`\x1b[36m[HoverSource] Port ${debugPort} is blocked. Try changing your app's debug port to ${debugPort + 1} temporarily? (y/N): \x1b[0m`);
          shouldPatch = portAnswer.trim().toLowerCase() === "y";
        } else {
          console.log(`[HoverSource] autoResolvePortConflicts is enabled. Automatically patching debug port to ${debugPort + 1}...`);
        }

        if (shouldPatch) {
          const newDebugPort = debugPort + 1;
          const patchResult = findAndPatchDebugPort(projectRoot, debugPort, newDebugPort);
          if (patchResult) {
            patchRestorer = patchResult.restore;
            debugPort = newDebugPort;
            isDebugPortInUse = false;
          } else {
            console.warn(`\x1b[33m[HoverSource] ⚠️ Could not locate any hardcoded references to port ${debugPort} in your scripts/ folder or root.\x1b[0m`);
          }
        }
      }

      if (isDebugPortInUse) {
        console.warn(`\x1b[33m[HoverSource] Proceeding with port ${debugPort} anyway. Overlay connection might fail.\x1b[0m\n`);
      }
    }
  }

  // 1. Start Companion Server
  startCompanionServer({
    port: serverPort,
    projectRoot,
    debugPort
  });

  // 2. Open dashboard if requested
  if (shouldOpenDashboard) {
    const dashboardUrl = `http://localhost:${serverPort}/dashboard`;
    console.log(`[HoverSource] Opening Dashboard in browser: ${dashboardUrl}`);
    openBrowser(dashboardUrl);
  }

  // ── MODE A: Proxy injection (web/browser apps) ──────────────────────────
  if (targetUrl) {
    let targetPort = 3000;
    try {
      targetPort = parseInt(new URL(targetUrl).port || "3000", 10);
    } catch {}
    const requestedProxyPort = parseInt((args["proxy-port"] as string) || String(targetPort + 1), 10);
    const proxyPort = await findFreePort(requestedProxyPort);
    if (proxyPort !== requestedProxyPort) {
      console.log(`[HoverSource] Proxy port ${requestedProxyPort} in use, using ${proxyPort} instead.`);
    }
    const overlayScriptUrl = `http://127.0.0.1:${serverPort}/hoversource-overlay.js`;

    console.log(`[HoverSource] Proxy mode: ${targetUrl} → http://localhost:${proxyPort}`);
    await startProxy(targetUrl, proxyPort, overlayScriptUrl);
    console.log(`[HoverSource] Proxy ready. Opening http://localhost:${proxyPort} in your browser...`);
    openBrowser(`http://localhost:${proxyPort}`);
    return; // No CDP loop needed in proxy mode
  }

  // ── MODE B: Exec wrapper (Electron apps) ────────────────────────────────
  if (execCommand) {
    console.log(`[HoverSource] Exec mode: spawning → ${execCommand}`);
    const childEnv = {
      ...process.env,
      ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${debugPort}`,
    };
    const child = spawn(execCommand, [], {
      shell: true,
      env: childEnv,
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.on("error", (err) => {
      console.error(`[HoverSource] Failed to spawn exec command:`, err.message);
    });
    // Fall through to CDP injection loop below
  }

  // 3. Locate bundled overlay script
  const pathsToTry = [
    path.resolve(__dirname, "../../overlay-core/dist/overlay.bundle.js"),
    path.resolve(__dirname, "../node_modules/@hoversource/overlay-core/dist/overlay.bundle.js"),
    path.resolve(projectRoot, "node_modules/@hoversource/overlay-core/dist/overlay.bundle.js")
  ];

  let scriptPath = "";
  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      scriptPath = p;
      break;
    }
  }

  if (!scriptPath) {
    console.error(`[HoverSource] Critical Error: Could not locate overlay.bundle.js.`);
    console.error(`Please run 'npm run build' inside the HoverSource directory before launching.`);
    process.exit(1);
  }

  const scriptContent = fs.readFileSync(scriptPath, "utf-8");
  // Prepend companion port so overlay can connect back regardless of configured port
  const portBootstrap = `window.__HOVERSOURCE_PORT__ = ${serverPort};\n`;
  const scriptWithPort = portBootstrap + scriptContent;

  // ── MODE C: Manual CDP (backward compat) ─ user opens their app with debug port
  console.log(`[HoverSource] Watching debug port :${debugPort} for Chromium targets...`);
  
  let isInjected = false;
  
  const pollAndInject = async () => {
    try {
      const injectedCount = await injectOverlayScript(debugPort, scriptWithPort);
      if (injectedCount > 0 && !isInjected) {
        console.log(`[HoverSource] Successfully connected and injected into ${injectedCount} target(s).`);
        isInjected = true;
      }
    } catch (err: any) {
      if (isInjected) {
        console.log(`[HoverSource] Lost connection or target closed. Re-watching...`);
        isInjected = false;
      }
      if (process.env.HOVERSOURCE_DEBUG) {
        console.error("[HoverSource] Polling connection error:", err.message || err);
      }
    }
  };

  await pollAndInject();
  setInterval(pollAndInject, 2500);
}

try {
  await main();
} catch (err) {
  console.error("[HoverSource] CLI crashed:", err);
  process.exit(1);
}
