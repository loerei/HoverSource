#!/usr/bin/env node

import { startCompanionServer } from "@hoversource/companion-server";
import { injectOverlayScript } from "@hoversource/client-injector";
import { startProxy } from "./proxy.js";
import { exec, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
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
    http.get(`http://127.0.0.1:${requestedPort}/ping`, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => resolve(body.trim() === "pong"));
    }).on("error", () => resolve(false));
  });

  if (isHs) {
    console.log(`[HoverSource] Previous instance found on port ${requestedPort}. Taking over...`);
    await new Promise<void>((resolve) => {
      http.get(`http://127.0.0.1:${requestedPort}/shutdown`, () => resolve())
        .on("error", () => resolve());
    });
    // Wait for the port to free up
    await new Promise((r) => setTimeout(r, 700));
    return requestedPort;
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

async function main() {
  const { args, subcommand } = getArgs();
  
  const requestedPort = parseInt((args.port as string) || process.env.HOVERSOURCE_PORT || "3000", 10);
  const serverPort = await resolveCompanionPort(requestedPort);
  if (serverPort === requestedPort) {
    // Took over or was free — no message needed
  }
  const debugPort = parseInt((args["debug-port"] as string) || process.env.HOVERSOURCE_DEBUG_PORT || "9222", 10);
  const projectRoot = path.resolve((args.root as string) || process.cwd());
  const shouldOpenDashboard = !!args.dashboard;
  const targetUrl = args.target as string | undefined;
  let execCommand = args.exec as string | undefined;

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
    }
  };

  await pollAndInject();
  setInterval(pollAndInject, 2500);
}

main().catch((err) => {
  console.error("[HoverSource] CLI crashed:", err);
  process.exit(1);
});
