#!/usr/bin/env node

import { startCompanionServer, loadMergedConfig } from "@hoversource/companion-server";
import { injectOverlayScript } from "@hoversource/client-injector";
import { startProxy } from "./proxy.js";
import { exec, spawn, execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import readline from "node:readline";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper functions to prevent Path Injection (S8707) and Command Injection (S8701)
export function validateSafePath(p: string): string {
  const pathRegex = /^[a-zA-Z0-9_\-\s./\\:]+$/;
  if (p.includes("..") || !pathRegex.test(p)) {
    throw new Error(`[HoverSource] Security Error: Path contains invalid characters or traversal sequence: ${p}`);
  }
  return p;
}

export function validateSafeCommand(cmd: string): string {
  const cmdRegex = /^[a-zA-Z0-9_\-\s./\\:'"]+$/;
  if (/[;&|<>$\n\r]/.test(cmd) || !cmdRegex.test(cmd)) {
    throw new Error(`[HoverSource] Security Error: Command contains invalid characters: ${cmd}`);
  }
  return cmd;
}

function parseLongOption(arg: string, args: Record<string, string | boolean>): void {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    args[arg.slice(2)] = true;
  } else {
    const key = arg.slice(2, eqIdx);
    const value = arg.slice(eqIdx + 1);
    args[key] = value;
  }
}

function parseShortOption(arg: string, args: Record<string, string | boolean>, argv: string[], indexRef: { index: number }): void {
  const char = arg.slice(1);
  const eqIdx = char.indexOf("=");
  const optionChar = eqIdx === -1 ? char : char.slice(0, eqIdx);
  const val = eqIdx === -1 ? undefined : char.slice(eqIdx + 1);

  const optionMap: Record<string, string> = {
    p: "port",
    t: "target",
    e: "exec",
    r: "root"
  };

  const simpleFlags: Record<string, string> = {
    d: "dashboard",
    h: "help",
    v: "vue",
    s: "solid",
    a: "angular"
  };

  if (optionChar in simpleFlags) {
    args[simpleFlags[optionChar]] = true;
  } else if (optionChar in optionMap) {
    const key = optionMap[optionChar];
    if (val === undefined) {
      const nextArg = argv[indexRef.index + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        indexRef.index++;
        args[key] = nextArg;
      }
    } else {
      args[key] = val;
    }
  }
}

// Helper to parse arguments
function getArgs() {
  const args: Record<string, string | boolean> = {};
  let subcommand: string | undefined;
  const indexRef = { index: 2 };

  for (; indexRef.index < process.argv.length; indexRef.index++) {
    const arg = process.argv[indexRef.index];
    if (arg.startsWith("--")) {
      parseLongOption(arg, args);
    } else if (arg.startsWith("-")) {
      parseShortOption(arg, args, process.argv, indexRef);
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
  const pkgPath = validateSafePath(path.join(projectRoot, "package.json"));
  if (!fs.existsSync(pkgPath)) {
    console.error(`[HoverSource] No package.json found in ${projectRoot}`);
    return undefined;
  }

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    console.error(`[HoverSource] Failed to parse package.json:`, err);
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
  let startCmd = "xdg-open";
  if (process.platform === "darwin") {
    startCmd = "open";
  } else if (process.platform === "win32") {
    startCmd = "start";
  }
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
            const pid = Number.parseInt(pidStr, 10);
            if (!Number.isNaN(pid) && pid > 0) {
              return resolve(pid);
            }
          }
        }
        resolve(undefined);
      });
    } else {
      exec(`lsof -t -i:${port}`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        const pid = Number.parseInt(stdout.trim(), 10);
        if (!Number.isNaN(pid) && pid > 0) {
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
          const name = parts[0].replaceAll('"', "");
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

function killProcessWindowsUac(pid: number, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`[HoverSource] Normal termination failed. Requesting Administrator elevation (UAC)...`);
    const tempFile = path.join(os.tmpdir(), `hs_taskkill_${pid}.log`);
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (err) {
        console.debug("[HoverSource] Failed to delete existing temp file:", err);
      }
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
            try { fs.unlinkSync(tempFile); } catch (err) {
              console.debug("[HoverSource] Temp file delete ignored:", err);
            }
            resolve(true);
          } else if (checks > 20) { // 4 seconds total
            clearInterval(checkInterval);
            
            // Read temp file for failure reasons
            let errorDetails = "";
            if (fs.existsSync(tempFile)) {
              try {
                errorDetails = fs.readFileSync(tempFile, "utf-8").trim();
                fs.unlinkSync(tempFile);
              } catch (err) {
                console.debug("[HoverSource] Failed to read/delete temp file:", err);
              }
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
        killProcessWindowsUac(pid, port).then(resolve);
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
    } catch (err) {
      console.debug("[HoverSource] Failed to parse patch state:", err);
    }
  }
  state[filePath] = originalContent;
  try {
    fs.writeFileSync(PATCH_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.debug("[HoverSource] Failed to write patch state:", err);
  }
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
  } catch (err) {
    console.debug("[HoverSource] Failed to remove patch state:", err);
  }
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
  } catch (err) {
    console.debug("[HoverSource] Leftover patch restore failed:", err);
  }
}

function patchSingleFileForDebugPort(
  fullPath: string,
  projectRoot: string,
  oldPort: number,
  newPort: number,
  patchedFiles: { path: string; originalContent: string }[]
): void {
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const searchStr = `--remote-debugging-port=${oldPort}`;
    if (content.includes(searchStr)) {
      const newContent = content.replaceAll(searchStr, `--remote-debugging-port=${newPort}`);
      fs.writeFileSync(fullPath, newContent, "utf-8");
      recordPatchState(fullPath, content);
      patchedFiles.push({ path: fullPath, originalContent: content });
      console.log(`[HoverSource] Temporarily patched debug port ${oldPort} -> ${newPort} in ${path.relative(projectRoot, fullPath)}`);
    }
  } catch (err) {
    console.debug(`[HoverSource] Failed to patch file ${fullPath}:`, err);
  }
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
        patchSingleFileForDebugPort(fullPath, projectRoot, oldPort, newPort, patchedFiles);
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
        } catch (err) {
          console.debug(`[HoverSource] Failed to restore file ${pf.path}:`, err);
        }
      }
    }
  };
}

async function checkDebugPortInUse(debugPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(debugPort, "127.0.0.1");
  });
}

function warnDebugPortInUse(debugPort: number, pid?: number, procName?: string) {
  console.warn(`\n\x1b[33m[HoverSource] ⚠️  WARNING: Debug port ${debugPort} is already in use by another process!\x1b[0m`);
  if (pid) {
    console.warn(`\x1b[33m[HoverSource] Process: ${procName || "Unknown"} (PID: ${pid})\x1b[0m`);
  } else {
    console.warn(`\x1b[33m[HoverSource] Could not identify the process holding the port.\x1b[0m`);
  }
  console.warn(`\x1b[33m[HoverSource] Electron will fail to bind to it, and the HoverSource overlay will not appear.\x1b[0m`);
}

async function handleTerminationOption(pid: number, debugPort: number, autoResolve: boolean): Promise<boolean> {
  let shouldKill = autoResolve;
  if (shouldKill) {
    console.log(`[HoverSource] autoResolvePortConflicts is enabled. Automatically terminating process ${pid}...`);
  } else {
    const answer = await askQuestion(`\x1b[36m[HoverSource] Would you like to terminate this process to free port ${debugPort}? (y/N): \x1b[0m`);
    shouldKill = answer.trim().toLowerCase() === "y";
  }

  if (shouldKill) {
    console.log(`[HoverSource] Terminating process ${pid}...`);
    const success = await killProcess(pid, debugPort);
    if (success) {
      console.log(`[HoverSource] Process terminated successfully. Port ${debugPort} is now free.`);
      // Wait a brief moment for OS to release the socket
      await new Promise((r) => setTimeout(r, 700));
      return true;
    } else {
      console.error(`[HoverSource] Failed to terminate process. You may need to run as administrator or close it manually.`);
    }
  }
  return false;
}

async function handlePatchOption(
  debugPort: number,
  projectRoot: string,
  autoResolve: boolean
): Promise<{ newDebugPort: number; patchRestorer?: () => void } | null> {
  let shouldPatch = autoResolve;
  if (shouldPatch) {
    console.log(`[HoverSource] autoResolvePortConflicts is enabled. Automatically patching debug port to ${debugPort + 1}...`);
  } else {
    const portAnswer = await askQuestion(`\x1b[36m[HoverSource] Port ${debugPort} is blocked. Try changing your app's debug port to ${debugPort + 1} temporarily? (y/N): \x1b[0m`);
    shouldPatch = portAnswer.trim().toLowerCase() === "y";
  }

  if (shouldPatch) {
    const newDebugPort = debugPort + 1;
    const patchResult = findAndPatchDebugPort(projectRoot, debugPort, newDebugPort);
    if (patchResult) {
      return { newDebugPort, patchRestorer: patchResult.restore };
    } else {
      console.warn(`\x1b[33m[HoverSource] ⚠️ Could not locate any hardcoded references to port ${debugPort} in your scripts/ folder or root.\x1b[0m`);
    }
  }
  return null;
}

async function resolveDebugPortConflicts(
  debugPort: number,
  projectRoot: string,
  autoResolve: boolean,
  args: any
): Promise<{ resolvedDebugPort: number; patchRestorer?: () => void }> {
  let isDebugPortInUse = await checkDebugPortInUse(debugPort);
  if (!isDebugPortInUse) {
    return { resolvedDebugPort: debugPort };
  }

  const pid = await getPidUsingPort(debugPort);
  const procName = pid ? await getProcessName(pid) : undefined;
  warnDebugPortInUse(debugPort, pid, procName);

  const isInteractive = (process.stdout.isTTY && process.stdin.isTTY) || autoResolve;
  let portFreed = false;
  if (isInteractive && pid) {
    portFreed = await handleTerminationOption(pid, debugPort, autoResolve);
  }

  let currentDebugPort = debugPort;
  let patchRestorer: (() => void) | undefined;

  if (!portFreed && isInteractive) {
    const patch = await handlePatchOption(currentDebugPort, projectRoot, autoResolve);
    if (patch) {
      currentDebugPort = patch.newDebugPort;
      patchRestorer = patch.patchRestorer;
    }
  }

  if (currentDebugPort === debugPort && isDebugPortInUse) {
    console.warn(`\x1b[33m[HoverSource] Proceeding with port ${currentDebugPort} anyway. Overlay connection might fail.\x1b[0m\n`);
  }

  return { resolvedDebugPort: currentDebugPort, patchRestorer };
}

async function runProxyMode(targetUrl: string, serverPort: number, args: any): Promise<void> {
  let targetPort = 3000;
  try {
    targetPort = Number.parseInt(new URL(targetUrl).port || "3000", 10);
  } catch (err) {
    console.debug("[HoverSource] Failed to parse target port:", err);
  }
  const requestedProxyPort = Number.parseInt((args["proxy-port"] as string) || String(targetPort + 1), 10);
  const proxyPort = await findFreePort(requestedProxyPort);
  if (proxyPort !== requestedProxyPort) {
    console.log(`[HoverSource] Proxy port ${requestedProxyPort} in use, using ${proxyPort} instead.`);
  }
  const overlayScriptUrl = `http://127.0.0.1:${serverPort}/hoversource-overlay.js`;

  console.log(`[HoverSource] Proxy mode: ${targetUrl} → http://localhost:${proxyPort}`);
  try {
    await startProxy(targetUrl, proxyPort, overlayScriptUrl);
  } catch (err) {
    console.error(`[HoverSource] Ignored proxy failure:`, err);
  }
  console.log(`[HoverSource] Proxy ready. Opening http://localhost:${proxyPort} in your browser...`);
  openBrowser(`http://localhost:${proxyPort}`);
}

function runExecMode(execCommand: string, projectRoot: string, debugPort: number): void {
  console.log(`[HoverSource] Exec mode: spawning → ${execCommand}`);
  const childEnv = {
    ...process.env,
    ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${debugPort}`,
  };
  const child = spawn(validateSafeCommand(execCommand), [], {
    shell: true,
    env: childEnv,
    cwd: validateSafePath(projectRoot),
    stdio: "inherit",
  });
  child.on("error", (err) => {
    console.error(`[HoverSource] Failed to spawn exec command:`, err.message);
  });
}

async function startCdpInjectionWatch(debugPort: number, scriptWithPort: string): Promise<void> {
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
      if (process.env.DEBUG) {
        console.debug("[HoverSource] Ignored poll injection error:", err.message);
      }
    }
  };

  await pollAndInject();
  setInterval(pollAndInject, 2500);
}

function runNpmCommand(args: string[], cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const nodeDir = path.dirname(process.execPath);
    const winNpmCli = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
    const unixNpmCli = path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");

    let npmCliJs = "";
    if (fs.existsSync(winNpmCli)) {
      npmCliJs = winNpmCli;
    } else if (fs.existsSync(unixNpmCli)) {
      npmCliJs = unixNpmCli;
    }

    if (npmCliJs) {
      execFile(process.execPath, [npmCliJs, ...args], { cwd: validateSafePath(cwd) }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      const isWin = process.platform === "win32";
      const npmBinName = isWin ? "npm.cmd" : "npm";
      const candidate = path.join(nodeDir, npmBinName);
      const npmBin = fs.existsSync(candidate) ? candidate : "npm";
      exec(`"${npmBin}" ${args.join(" ")}`, { cwd: validateSafePath(cwd) }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

async function installVitePluginInvasive(
  projectRoot: string,
  config: {
    framework: string;
    pluginName: string;
    attributeName: string;
    importStatement: string;
    pluginCall: string;
  }
) {
  console.log(`\n\x1b[36m[HoverSource] >>> INVASIVE ${config.framework.toUpperCase()} SETUP <<<\x1b[0m`);
  console.log(`Invasive mode works by adding \x1b[32m${config.pluginName}\x1b[0m to your project.`);
  console.log(`This plugin injects '${config.attributeName}' HTML attributes (file paths, line numbers, column numbers)`);
  console.log(`directly into DOM elements during compilation, enabling pixel-perfect template resolution in ${config.framework}.`);
  console.log(`\n\x1b[33m[Warning] This action is invasive. It will:`);
  console.log(`  1. Install '${config.pluginName}' as a devDependency in your package.json.`);
  console.log(`  2. Modify your vite.config.ts / vite.config.js to register the plugin.\x1b[0m`);
  
  const answer = await askQuestion(`\n\x1b[35mAre you sure you want to proceed? (y/N): \x1b[0m`);
  if (answer.trim().toLowerCase() !== "y") {
    console.log(`[HoverSource] Installation aborted.`);
    return;
  }

  console.log(`[HoverSource] Setting up ${config.framework} invasive mode...`);

  // 1. Install devDependency
  console.log(`[HoverSource] Installing ${config.pluginName}...`);
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error(`[HoverSource] Error: No package.json found at ${projectRoot}`);
    return;
  }

  try {
    await runNpmCommand(["install", "-D", config.pluginName], projectRoot);
    console.log(`[HoverSource] Successfully installed ${config.pluginName}.`);
  } catch (err) {
    console.error(`[HoverSource] Failed to install package:`, err);
    throw err;
  }

  // 2. Modify vite config
  let configPath = validateSafePath(path.join(projectRoot, "vite.config.ts"));
  if (!fs.existsSync(configPath)) {
    configPath = validateSafePath(path.join(projectRoot, "vite.config.js"));
  }

  if (!fs.existsSync(configPath)) {
    console.warn(`[HoverSource] Warning: Could not find vite.config.ts or vite.config.js.`);
    console.log(`Please register '${config.pluginName}' manually in your Vite config.`);
    return;
  }

  console.log(`[HoverSource] Registering plugin in ${path.basename(configPath)}...`);
  let configContent = fs.readFileSync(configPath, "utf-8");

  // Check if already registered
  if (configContent.includes(config.pluginName)) {
    console.log(`[HoverSource] Plugin already registered in ${path.basename(configPath)}.`);
    return;
  }

  // Insert import
  configContent = config.importStatement + configContent;

  // Insert plugin call inside plugins array
  if (configContent.includes("plugins:")) {
    configContent = configContent.replace(/plugins:\s*\[/, `plugins: [\n    ${config.pluginCall},`);
    fs.writeFileSync(configPath, configContent, "utf-8");
    console.log(`[HoverSource] Successfully registered plugin in ${path.basename(configPath)}.`);
  } else {
    fs.writeFileSync(configPath, configContent, "utf-8");
    console.warn(`[HoverSource] Warning: Could not automatically locate 'plugins: [' array inside Vite config.`);
    console.log(`Please manually add '${config.pluginCall}' to your plugins array.`);
  }
}

async function installVueInvasive(projectRoot: string) {
  await installVitePluginInvasive(projectRoot, {
    framework: "Vue",
    pluginName: "vite-plugin-vue-inspector",
    attributeName: "data-v-inspector",
    importStatement: 'import Inspector from "vite-plugin-vue-inspector";\n',
    pluginCall: "Inspector()"
  });
}

async function installSolidInvasive(projectRoot: string) {
  await installVitePluginInvasive(projectRoot, {
    framework: "SolidJS",
    pluginName: "solid-devtools",
    attributeName: "data-source-loc",
    importStatement: 'import devtools from "solid-devtools/vite";\n',
    pluginCall: "devtools()"
  });
}

async function installAngularInvasive(projectRoot: string) {
  console.log(`\n\x1b[36m[HoverSource] >>> INVASIVE ANGULAR SETUP <<<\x1b[0m`);
  console.log(`Invasive mode works by adding \x1b[32mngx-locatorjs\x1b[0m to your project.`);
  console.log(`This utility sets up a runtime hook and proxy to map components to source code.`);
  console.log(`\n\x1b[33m[Warning] This action is invasive. It will:`);
  console.log(`  1. Install 'ngx-locatorjs' as a devDependency in your package.json.`);
  console.log(`  2. Generate configuration files (npx locatorjs-config).`);
  console.log(`  3. Modify your main.ts to import and initialize the locator.\x1b[0m`);
  
  const answer = await askQuestion(`\n\x1b[35mAre you sure you want to proceed? (y/N): \x1b[0m`);
  if (answer.trim().toLowerCase() !== "y") {
    console.log(`[HoverSource] Installation aborted.`);
    return;
  }

  console.log(`[HoverSource] Setting up Angular invasive mode...`);

  // 1. Install ngx-locatorjs
  console.log(`[HoverSource] Installing ngx-locatorjs...`);
  const pkgPath = validateSafePath(path.join(projectRoot, "package.json"));
  if (!fs.existsSync(pkgPath)) {
    console.error(`[HoverSource] Error: No package.json found at ${projectRoot}`);
    return;
  }

  try {
    await runNpmCommand(["install", "-D", "ngx-locatorjs"], projectRoot);
    console.log(`[HoverSource] Successfully installed ngx-locatorjs.`);
  } catch (err) {
    console.error(`[HoverSource] Failed to install package:`, err);
    throw err;
  }

  // 2. Generate config
  console.log(`[HoverSource] Running locatorjs-config...`);
  try {
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    await new Promise<void>((resolve, reject) => {
      exec(`${npxCmd} locatorjs-config`, { cwd: validateSafePath(projectRoot) }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`[HoverSource] Generated locatorjs configuration.`);
  } catch (err) {
    console.warn(`[HoverSource] Warning: Failed to run locatorjs-config. You may need to run 'npx locatorjs-config' manually.`, err);
  }

  // 3. Modify main.ts
  let mainPath = validateSafePath(path.join(projectRoot, "src", "main.ts"));
  if (!fs.existsSync(mainPath)) {
    mainPath = validateSafePath(path.join(projectRoot, "main.ts"));
  }

  if (!fs.existsSync(mainPath)) {
    console.warn(`[HoverSource] Warning: Could not find main.ts.`);
    console.log(`Please manually import and initialize 'ngx-locatorjs' in your application entry file.`);
    return;
  }

  console.log(`[HoverSource] Appending locator hook to ${path.basename(mainPath)}...`);
  let mainContent = fs.readFileSync(mainPath, "utf-8");

  if (mainContent.includes("ngx-locatorjs")) {
    console.log(`[HoverSource] ngx-locatorjs already imported in ${path.basename(mainPath)}.`);
    return;
  }

  const locatorHook = `\n\n// HoverSource/ngx-locatorjs integration\nimport("ngx-locatorjs").then(m => {\n  try {\n    m.installAngularLocator({ enableNetwork: true });\n  } catch (e) {\n    console.warn("[HoverSource] Failed to load Angular locator", e);\n  }\n});\n`;
  mainContent += locatorHook;
  fs.writeFileSync(mainPath, mainContent, "utf-8");
  console.log(`[HoverSource] Successfully appended locator hook to ${path.basename(mainPath)}.`);
}

async function uninstallInvasive(projectRoot: string) {
  console.log(`\n\x1b[36m[HoverSource] >>> UNINSTALL INVASIVE PLUGINS <<<\x1b[0m`);
  
  const answer = await askQuestion(`\n\x1b[35mAre you sure you want to uninstall HoverSource invasive plugins? (y/N): \x1b[0m`);
  if (answer.trim().toLowerCase() !== "y") {
    console.log(`[HoverSource] Aborted.`);
    return;
  }

  // 1. Remove from package.json
  console.log(`[HoverSource] Uninstalling packages...`);
  try {
    await runNpmCommand(["uninstall", "vite-plugin-vue-inspector", "solid-devtools", "ngx-locatorjs"], projectRoot);
    console.log(`[HoverSource] Packages uninstalled.`);
  } catch (err) {
    console.error(`[HoverSource] Failed to uninstall packages:`, err);
  }

  // 2. Remove from Vite config
  let configPath = validateSafePath(path.join(projectRoot, "vite.config.ts"));
  if (!fs.existsSync(configPath)) {
    configPath = validateSafePath(path.join(projectRoot, "vite.config.js"));
  }

  if (fs.existsSync(configPath)) {
    console.log(`[HoverSource] Cleaning ${path.basename(configPath)}...`);
    let configContent = fs.readFileSync(configPath, "utf-8");
    
    // Remove imports
    configContent = configContent.replace(/import Inspector from\s*['"]vite-plugin-vue-inspector['"];?\n?/, "");
    configContent = configContent.replace(/import devtools from\s*['"]solid-devtools\/vite['"];?\n?/, "");
    // Remove plugin calls
    configContent = configContent.replace(/Inspector\(\),?\\n?\\s*/, "");
    configContent = configContent.replace(/devtools\(\),?\\n?\\s*/, "");
    
    fs.writeFileSync(configPath, configContent, "utf-8");
    console.log(`[HoverSource] Cleared Vite plugin registrations.`);
  }

  // 3. Remove from main.ts
  let mainPath = validateSafePath(path.join(projectRoot, "src", "main.ts"));
  if (!fs.existsSync(mainPath)) {
    mainPath = validateSafePath(path.join(projectRoot, "main.ts"));
  }

  if (fs.existsSync(mainPath)) {
    console.log(`[HoverSource] Cleaning ${path.basename(mainPath)}...`);
    let mainContent = fs.readFileSync(mainPath, "utf-8");
    // Remove our integration block
    mainContent = mainContent.replace(/\n\n\/\/ HoverSource\/ngx-locatorjs integration[\s\S]*installAngularLocator[\s\S]*\}\);\n/, "");
    fs.writeFileSync(mainPath, mainContent, "utf-8");
    console.log(`[HoverSource] Cleared Angular main.ts hooks.`);
  }

  console.log(`[HoverSource] Uninstallation complete.`);
}

function printHelp() {
  console.log(`HoverSource CLI - Code intelligence overlay for web and Electron applications

Usage:
  hs [subcommand] [options]

Subcommands:
  install -v|-s|-a|--vue|--solid|--angular   Install framework integration plugins
  uninstall                                  Uninstall framework integration plugins
  [npm-script]                               Run an npm script from package.json with HoverSource enabled (e.g. hs start, hs dev)

Options:
  -r, --root=<path>                          Path to the project root directory (default: current directory)
  -p, --port=<port>                          Port for the companion server (default: 3000)
  --debug-port=<port>                        Debug port for remote debugging (default: 9222)
  -t, --target=<url>                         Proxy mode target URL (for web/browser apps)
  -e, --exec=<command>                       Exec mode command wrapper (for Electron apps)
  --proxy-port=<port>                        Port for the local proxy server (default: target port + 1)
  -d, --dashboard                            Open the HoverSource dashboard in browser on startup
  -h, --help                                 Display this help message

Examples:
  hs start                                   Run the start script from package.json
  hs -t http://localhost:5173                Launch companion server and proxy targeting localhost:5173
  hs install -v                              Install Vue template inspector plugin`);
}

async function handleSubcommands(
  subcommand: string | undefined,
  args: any,
  projectRoot: string
): Promise<void> {
  if (subcommand === "install") {
    if (args.vue) {
      await installVueInvasive(projectRoot);
      process.exit(0);
    } else if (args.solid) {
      await installSolidInvasive(projectRoot);
      process.exit(0);
    } else if (args.angular) {
      await installAngularInvasive(projectRoot);
      process.exit(0);
    } else {
      console.log("[HoverSource] Please specify a framework to install, e.g. hs install --vue, --solid, --angular");
      process.exit(1);
    }
  }
  if (subcommand === "uninstall") {
    await uninstallInvasive(projectRoot);
    process.exit(0);
  }
}

function findScriptPath(projectRoot: string): string {
  const pathsToTry = [
    path.resolve(__dirname, "../../overlay-core/dist/overlay.bundle.js"),
    path.resolve(__dirname, "../node_modules/@hoversource/overlay-core/dist/overlay.bundle.js"),
    path.resolve(projectRoot, "node_modules/@hoversource/overlay-core/dist/overlay.bundle.js")
  ];

  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  console.error(`[HoverSource] Critical Error: Could not locate overlay.bundle.js.`);
  console.error(`Please run 'npm run build' inside the HoverSource directory before launching.`);
  process.exit(1);
}

function setupCleanup(cleanup: () => void): void {
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
}

function resolveExecCommand(
  subcommand: string | undefined,
  execCommand: string | undefined,
  targetUrl: string | undefined,
  projectRoot: string
): string | undefined {
  if (subcommand && !execCommand && !targetUrl) {
    const resolved = resolveSubcommand(subcommand, projectRoot);
    if (!resolved) {
      process.exit(1);
    }
    if (resolved.isElectron) {
      console.log(`[HoverSource] Detected Electron project, using exec mode.`);
    }
    return resolved.execCommand;
  }
  return execCommand;
}

async function main() {
  // Self-heal any leftover patches from previous crashed/force-killed runs
  restoreLeftoverPatches();

  const { args, subcommand } = getArgs();

  if (subcommand === "help" || args.help) {
    printHelp();
    process.exit(0);
  }
  const rawRoot = (args.root as string) || process.cwd();
  const projectRoot = path.resolve(validateSafePath(rawRoot));

  await handleSubcommands(subcommand, args, projectRoot);

  const config = loadMergedConfig(projectRoot);
  const autoResolve = config.autoResolvePortConflicts === true;
  
  const requestedPort = Number.parseInt((args.port as string) || process.env.HOVERSOURCE_PORT || "3000", 10);
  const serverPort = await resolveCompanionPort(requestedPort);

  let debugPort = Number.parseInt((args["debug-port"] as string) || process.env.HOVERSOURCE_DEBUG_PORT || "9222", 10);
  const shouldOpenDashboard = !!args.dashboard;
  const targetUrl = args.target as string | undefined;
  let execCommand = args.exec as string | undefined;
  if (execCommand) {
    validateSafeCommand(execCommand);
  }

  let patchRestorer: (() => void) | undefined;
  const cleanup = () => {
    if (patchRestorer) {
      try {
        patchRestorer();
        patchRestorer = undefined;
      } catch (err) {
        console.debug("[HoverSource] Cleanup handler error:", err);
      }
    }
  };
  setupCleanup(cleanup);

  execCommand = resolveExecCommand(subcommand, execCommand, targetUrl, projectRoot);

  console.log(`[HoverSource] Initializing...`);

  // If in exec mode, check if the debugPort is already occupied and warn/prompt the user
  if (execCommand) {
    const conflicts = await resolveDebugPortConflicts(debugPort, projectRoot, autoResolve, args);
    debugPort = conflicts.resolvedDebugPort;
    patchRestorer = conflicts.patchRestorer;
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

  // ─── MODE A: Proxy injection (web/browser apps) ──────────────────────────
  if (targetUrl) {
    await runProxyMode(targetUrl, serverPort, args);
    return;
  }

  // ─── MODE B: Exec wrapper (Electron apps) ────────────────────────────────
  if (execCommand) {
    runExecMode(execCommand, projectRoot, debugPort);
  }

  // 3. Locate bundled overlay script
  const scriptPath = findScriptPath(projectRoot);
  const scriptContent = fs.readFileSync(validateSafePath(scriptPath), "utf-8");
  // Prepend companion port so overlay can connect back regardless of configured port
  const portBootstrap = `globalThis.__HOVERSOURCE_PORT__ = ${serverPort};\n`;
  const scriptWithPort = portBootstrap + scriptContent;

  // ─── MODE C: Manual CDP (backward compat) ─ user opens their app with debug port
  await startCdpInjectionWatch(debugPort, scriptWithPort);
}

try {
  await main();
} catch (err) {
  console.error("[HoverSource] CLI crashed:", err);
  process.exit(1);
}
