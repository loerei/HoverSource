#!/usr/bin/env node

import { startCompanionServer, loadMergedConfig } from "@hoversource/companion-server";
import { injectOverlayScript } from "@hoversource/client-injector";
import { startProxy } from "./proxy.js";
import { exec, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import https from "node:https";
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

export function validateSafeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`[HoverSource] Security Error: Target URL protocol must be http or https`);
    }
    const hostRegex = /^[a-zA-Z0-9_\-.]+$/;
    if (!hostRegex.test(parsed.hostname)) {
      throw new Error(`[HoverSource] Security Error: Target URL contains invalid hostname`);
    }
    return urlStr;
  } catch (e: any) {
    throw new Error(`[HoverSource] Security Error: Invalid Target URL: ${e.message}`);
  }
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
  const hasElectronDep = "electron" in allDeps;
  let isElectron = hasElectronDep;
  if (hasElectronDep) {
    const scriptCmd = scripts[subcommand] || "";
    const lowerCmd = scriptCmd.toLowerCase();
    const isWebDevServer = (
      lowerCmd.includes("vite") ||
      lowerCmd.includes("next ") ||
      lowerCmd.includes("nuxt") ||
      lowerCmd.includes("webpack") ||
      lowerCmd.includes("astro")
    );
    const mentionsElectron = lowerCmd.includes("electron");
    if (isWebDevServer && !mentionsElectron) {
      isElectron = false;
    }
  }

  return { execCommand: `npm run ${subcommand}`, isElectron };
}

function detectDevServerPort(projectRoot: string, execCommand?: string): number {
  let configPort: number | undefined;

  // 1. Try to find custom port from config file mentioned in execCommand
  if (execCommand) {
    try {
      let actualCmd = execCommand;
      const npmRunMatch = execCommand.match(/^(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?([^\s]+)/);
      if (npmRunMatch) {
        const scriptName = npmRunMatch[1];
        const pkgPath = path.join(projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          if (pkg.scripts && pkg.scripts[scriptName]) {
            actualCmd = pkg.scripts[scriptName];
          }
        }
      }

      const configMatch = actualCmd.match(/(?:--config|-c)\s+([^\s"'\\]+)/);
      let configPath = configMatch ? configMatch[1] : undefined;
      if (!configPath) {
        const fileMatch = actualCmd.match(/([^\s"'\\]+\.config\.[jt]s)/);
        configPath = fileMatch ? fileMatch[1] : undefined;
      }

      if (configPath) {
        const fullPath = path.resolve(projectRoot, configPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const portMatch = content.match(/port:\s*(\d+)/);
          if (portMatch) {
            configPort = Number.parseInt(portMatch[1], 10);
          }
        }
      }
    } catch {}
  }

  // 2. Try to find common config files in root
  if (!configPort) {
    const commonConfigs = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"];
    for (const file of commonConfigs) {
      try {
        const fullPath = path.join(projectRoot, file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const portMatch = content.match(/port:\s*(\d+)/);
          if (portMatch) {
            configPort = Number.parseInt(portMatch[1], 10);
            break;
          }
        }
      } catch {}
    }
  }

  if (configPort && !Number.isNaN(configPort)) {
    return configPort;
  }

  // 3. Fallback to package.json dependencies
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return 3000;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if ("next" in allDeps) return 3000;
    if ("nuxt" in allDeps) return 3000;
    if ("vite" in allDeps) return 5173;
    if ("@sveltejs/kit" in allDeps) return 5173;
    if ("@angular/cli" in allDeps || "@angular/core" in allDeps) return 4200;
    if ("webpack-dev-server" in allDeps) return 8080;
  } catch {}

  return 3000;
}

function probeHostPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        // Other errors (e.g. EADDRNOTAVAIL for IPv6 on some systems) do not mean the port is in use
        resolve(true);
      }
    });
    server.listen(port, host, () => {
      server.close();
      resolve(true);
    });
  });
}

export async function isPortFree(port: number): Promise<boolean> {
  const free127 = await probeHostPort(port, "127.0.0.1");
  if (!free127) return false;

  const free000 = await probeHostPort(port, "0.0.0.0");
  if (!free000) return false;

  const freeIPv6 = await probeHostPort(port, "::");
  if (!freeIPv6) return false;

  return true;
}

export async function findFreePort(startPort: number, excludePort?: number, maxPort = 65535): Promise<number> {
  let port = startPort;
  while (port <= maxPort) {
    if (port === excludePort) {
      port++;
      continue;
    }
    if (await isPortFree(port)) {
      return port;
    }
    port++;
  }
  throw new Error(
    `[HoverSource] No free port found between ${startPort} and ${maxPort}. ` +
    `Close some applications or specify a port manually with --port=<port>.`
  );
}

/**
 * If the requested port is occupied by another HoverSource instance, tell it
 * to shut down and wait for the port to free up so we can reuse it.
 * Returns the port we should actually bind to.
 */
export async function resolveCompanionPort(requestedPort: number, targetPort?: number): Promise<number> {
  // If requestedPort collides with targetPort, shift it to next free port starting from 7300 upwards (excluding targetPort)
  if (targetPort !== undefined && requestedPort === targetPort) {
    console.log(`[HoverSource] Requested companion port ${requestedPort} conflicts with target application port ${targetPort}. Shifting...`);
    return findFreePort(7300, targetPort);
  }

  // Try to bind immediately — port is free
  const free = await isPortFree(requestedPort);
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
    const isNowFree = await isPortFree(requestedPort);

    if (isNowFree) {
      return requestedPort;
    } else {
      console.log(`[HoverSource] Previous instance on port ${requestedPort} could not be terminated (ghost port).`);
    }
  }

  // Something else owns this port — find the next free one
  console.log(`[HoverSource] Port ${requestedPort} in use by another process, using next free port.`);
  return findFreePort(requestedPort + 1, targetPort);
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
    const state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8")) as Record<string, string>;
    for (const [filePath, originalContent] of Object.entries(state)) {
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, originalContent, "utf-8");
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
    const newDebugPort = await findFreePort(debugPort + 1);
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
    console.warn(`\x1b[33m[HoverSource] To fix: close the process using port ${currentDebugPort}, or pass --debug-port=<free-port>.\x1b[0m`);
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
  const requestedProxyPort = Number.parseInt((args["proxy-port"] as string) || String(10000 + targetPort), 10);
  const proxyPort = await findFreePort(requestedProxyPort);
  if (proxyPort !== requestedProxyPort) {
    console.log(`[HoverSource] Proxy port ${requestedProxyPort} in use, using ${proxyPort} instead.`);
  }
  const overlayScriptUrl = "/hoversource/hoversource-overlay.js";
  const useHttps = targetUrl.toLowerCase().startsWith("https:");

  console.log(`[HoverSource] Proxy mode: ${targetUrl} → ${useHttps ? "https" : "http"}://localhost:${proxyPort}`);
  try {
    await startProxy({
      targetUrl,
      proxyPort,
      companionPort: serverPort,
      overlayScriptUrl,
      useHttps,
    });
    console.log(`[HoverSource] Proxy ready. Opening ${useHttps ? "https" : "http"}://localhost:${proxyPort} in your browser...`);
    openBrowser(`${useHttps ? "https" : "http"}://localhost:${proxyPort}`);
  } catch (err: any) {
    const isAddrInUse = err?.code === "EADDRINUSE";
    console.error(`[HoverSource] Proxy failed to start on port ${proxyPort}.`);
    if (isAddrInUse) {
      console.error(`[HoverSource] Port ${proxyPort} is in use. Pass --proxy-port=<port> or close the process using it.`);
    } else {
      console.error(`[HoverSource] Error: ${err?.message || err}`);
    }
    console.error(`[HoverSource] The companion server is still running. You can open http://localhost:${serverPort}/dashboard directly.`);
  }
}

async function waitForServer(
  port: number,
  timeoutMs = 120_000,
  hasExitedCheck?: () => boolean
): Promise<boolean> {
  const start = Date.now();
  let dots = 0;
  while (Date.now() - start < timeoutMs) {
    if (hasExitedCheck && hasExitedCheck()) {
      return false;
    }
    const up = await new Promise<boolean>((resolve) => {
      const tryHost = (url: string) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(true);
        });
        req.setTimeout(500, () => {
          req.destroy();
          if (url.includes("localhost")) {
            tryHost(`http://127.0.0.1:${port}`);
          } else {
            resolve(false);
          }
        });
        req.on("error", () => {
          if (url.includes("localhost")) {
            tryHost(`http://127.0.0.1:${port}`);
          } else {
            resolve(false);
          }
        });
      };
      tryHost(`http://localhost:${port}`);
    });
    if (up) return true;
    dots++;
    if (dots % 6 === 0) {
      console.log(`[HoverSource] Still waiting for dev server on port ${port}...`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function runWebAppMode(
  execCommand: string,
  projectRoot: string,
  serverPort: number,
  args: any
): Promise<{ child: ReturnType<typeof spawn> }> {
  const config = loadMergedConfig(projectRoot);
  const timeoutSec = config.webAppDevServerTimeout ?? 120;
  const timeoutMs = timeoutSec * 1000;

  const devPort = detectDevServerPort(projectRoot, execCommand);
  console.log(`[HoverSource] Web app detected. Dev server expected on port ${devPort}.`);

  const devPortFree = await isPortFree(devPort);
  if (!devPortFree) {
    const pid = await getPidUsingPort(devPort);
    const procName = pid ? await getProcessName(pid) : undefined;
    console.warn(`\n\x1b[33m[HoverSource] ⚠️  WARNING: Dev server port ${devPort} is already in use by another process!\x1b[0m`);
    if (pid) {
      console.warn(`\x1b[33m[HoverSource] Process: ${procName || "Unknown"} (PID: ${pid})\x1b[0m`);
    } else {
      console.warn(`\x1b[33m[HoverSource] Could not identify the process holding the port.\x1b[0m`);
    }
    
    const autoResolve = args["auto-resolve"] === true;
    const isInteractive = (process.stdout.isTTY && process.stdin.isTTY) || autoResolve;
    
    let resolvedConflict = false;
    if (pid && isInteractive) {
      let shouldKill = autoResolve;
      if (shouldKill) {
        console.log(`[HoverSource] autoResolvePortConflicts is enabled. Automatically terminating process ${pid}...`);
      } else {
        const answer = await askQuestion(`\x1b[36m[HoverSource] Would you like to terminate this process to free port ${devPort}? (y/N): \x1b[0m`);
        shouldKill = answer.trim().toLowerCase() === "y";
      }
      
      if (shouldKill) {
        console.log(`[HoverSource] Terminating process ${pid}...`);
        const success = await killProcess(pid, devPort);
        if (success) {
          console.log(`[HoverSource] Process terminated successfully. Port ${devPort} is now free.`);
          resolvedConflict = true;
          // Wait a brief moment for OS to release the socket
          await new Promise((r) => setTimeout(r, 700));
        } else {
          console.error(`[HoverSource] Failed to terminate process. You may need to run as administrator or close it manually.`);
        }
      }
    }
    
    if (!resolvedConflict) {
      console.warn(`[HoverSource] Continuing anyway. If it fails, please close the process using port ${devPort} manually.`);
    }
  }

  // Spawn the dev server
  const { command, args: cmdArgs } = parseCommand(execCommand);
  const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));
  const useShell = process.platform === "win32";
  const child = useShell
    ? spawn([resolvedCmd, ...cmdArgs].join(" "), {
        shell: true,
        env: process.env,
        cwd: validateSafePath(projectRoot),
        stdio: "inherit",
      })
    : spawn(resolvedCmd, cmdArgs, {
        shell: false,
        env: process.env,
        cwd: validateSafePath(projectRoot),
        stdio: "inherit",
        detached: true,
      });

  child.on("error", (err) => {
    console.error(`[HoverSource] Dev server failed to start:`, err.message);
  });

  let hasExited = false;
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    hasExited = true;
    exitCode = code;
  });

  // Wait for the dev server to be ready
  console.log(`[HoverSource] Waiting for dev server on port ${devPort} (timeout: ${timeoutSec}s)...`);
  const ready = await waitForServer(devPort, timeoutMs, () => hasExited);

  if (!ready) {
    if (hasExited) {
      console.error(`\n\x1b[31m[HoverSource] Error: Dev server process exited early with code ${exitCode}.\x1b[0m`);
      console.error(`[HoverSource] Please make sure your dev server is built and can run successfully.`);
      console.error(`[HoverSource] If it's a production server, ensure you have built it first (e.g. npm run build)`);
      console.error(`[HoverSource] or run the development server instead (e.g. hs dev).`);
      return { child };
    }
    console.error(`[HoverSource] Dev server did not respond on port ${devPort} within timeout.`);
    console.error(`[HoverSource] If your dev server uses a different port, run it separately and use:`);
    console.error(`\x1b[36m[HoverSource]   hs -t http://localhost:<your-port>\x1b[0m`);
    return { child };
  }

  console.log(`[HoverSource] Dev server is ready on port ${devPort}.`);
  await runProxyMode(`http://localhost:${devPort}`, serverPort, args);
  return { child };
}

function cleanArgument(arg: string): string {
  const first = arg[0];
  if ((first === '"' || first === "'") && arg.endsWith(first)) {
    return arg.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return arg;
}

function parseCommand(cmdString: string): { command: string; args: string[] } {
  const matches = cmdString.match(/[^"'\s]+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) || [];
  const parts = matches.map(cleanArgument);
  return {
    command: parts[0] || "",
    args: parts.slice(1),
  };
}

function resolveWindowsCommand(command: string): string {
  if (process.platform === "win32") {
    const commonCmds = ["npm", "npx", "yarn", "pnpm", "gulp", "tsc"];
    if (commonCmds.includes(command.toLowerCase())) {
      return `${command}.cmd`;
    }
  }
  return command;
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

function runExecMode(
  execCommand: string,
  projectRoot: string,
  debugPort: number,
  serverPort: number,
  args: any
): void {
  const { command, args: cmdArgs } = parseCommand(execCommand);
  const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));

  const runWithCdp = (portToUse: number, patchRestorer?: () => void) => {
    const electronArgs = [...cmdArgs, `--remote-debugging-port=${portToUse}`];
    console.log(`[HoverSource] Launching target command with remote debugging: ${[resolvedCmd, ...electronArgs].join(" ")}`);
    
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn([resolvedCmd, ...electronArgs].join(" "), {
          shell: true,
          env: process.env,
          cwd: validateSafePath(projectRoot),
          stdio: "inherit",
        })
      : spawn(resolvedCmd, electronArgs, {
          shell: false,
          env: process.env,
          cwd: validateSafePath(projectRoot),
          stdio: "inherit",
          detached: true,
        });

    child.on("error", (err) => {
      console.error(`[HoverSource] Exec command failed to start: ${err.message}`);
    });

    const scriptPath = findScriptPath(projectRoot);
    const scriptContent = fs.readFileSync(validateSafePath(scriptPath), "utf-8");
    const portBootstrap = `globalThis.__HOVERSOURCE_PORT__ = ${serverPort};\n`;
    const scriptWithPort = portBootstrap + scriptContent;
    
    startCdpInjectionWatch(portToUse, scriptWithPort);

    const cleanup = () => {
      if (patchRestorer) patchRestorer();
      process.exit();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    child.on("exit", cleanup);
  };

  const autoResolve = args["auto-resolve"] === true;
  resolveDebugPortConflicts(debugPort, projectRoot, autoResolve, args).then((resolved) => {
    runWithCdp(resolved.resolvedDebugPort, resolved.patchRestorer);
  });
}

async function checkTargetUrlUp(targetUrl: string): Promise<boolean> {
  const safeTarget = validateSafeUrl(targetUrl);
  return new Promise((resolve) => {
    try {
      const url = new URL(safeTarget);
      const schemesList = ["http:", "https:"];
      if (schemesList.includes(url.protocol)) {
        const isHttps = url.protocol === "https:";
        const req = isHttps
          ? https.get(url, (res) => {
              res.resume();
              resolve(true);
            })
          : http.get(url, (res) => {
              res.resume();
              resolve(true);
            });
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
        req.on("error", () => resolve(false));
      } else {
        resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}

async function handleExecMode(
  execArg: string,
  subcommand: string | undefined,
  projectRoot: string,
  debugPort: number,
  serverPort: number,
  args: Record<string, string | boolean>
) {
  let resolved = { execCommand: execArg, isElectron: false };
  if (subcommand) {
    const resolvedSub = resolveSubcommand(subcommand, projectRoot);
    if (!resolvedSub) {
      process.exit(1);
    }
    resolved = resolvedSub;
  } else {
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const hasElectronDep = "electron" in allDeps;
        let isElectron = hasElectronDep;
        if (hasElectronDep) {
          const lowerCmd = execArg.toLowerCase();
          const isWebDevServer = (
            lowerCmd.includes("vite") ||
            lowerCmd.includes("next ") ||
            lowerCmd.includes("nuxt") ||
            lowerCmd.includes("webpack") ||
            lowerCmd.includes("astro")
          );
          const mentionsElectron = lowerCmd.includes("electron");
          if (isWebDevServer && !mentionsElectron) {
            isElectron = false;
          }
        }
        resolved.isElectron = isElectron;
      } catch {}
    }
  }

  if (resolved.isElectron) {
    console.log(`[HoverSource] Electron app detected. Running in exec mode.`);
    runExecMode(resolved.execCommand, projectRoot, debugPort, serverPort, args);
  } else {
    console.log(`[HoverSource] Web application detected. Running in web-app mode.`);
    const { child } = await runWebAppMode(resolved.execCommand, projectRoot, serverPort, args);
    
    const cleanup = () => {
      if (child.pid) {
        try {
          if (process.platform === "win32") {
            exec(`taskkill /F /T /PID ${child.pid}`);
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {
          child.kill();
        }
      } else {
        child.kill();
      }
      process.exit();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    child.on("exit", cleanup);
  }
}

async function main() {
  restoreLeftoverPatches();

  const { args, subcommand } = getArgs();

  if (args.help || args.h) {
    showHelp();
    return;
  }

  const projectRoot = validateSafePath(path.resolve(String(args.root || args.r || ".")));
  const requestedPort = Number.parseInt(String(args.port || args.p || 7300), 10);
  const debugPort = Number.parseInt(String(args["debug-port"] || 9222), 10);

  // Check if start script exists in package.json to avoid conflict
  let hasStartScript = false;
  try {
    const pkgPath = validateSafePath(path.join(projectRoot, "package.json"));
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg?.scripts?.start) {
        hasStartScript = true;
      }
    }
  } catch {}

  // суб-команда Start
  if (subcommand === "start" && !hasStartScript) {
    console.log(`[HoverSource] Starting companion server...`);
    const serverPort = await resolveCompanionPort(requestedPort);
    await startCompanionServer({ port: serverPort, projectRoot, debugPort });
    console.log(`[HoverSource] Companion server running on port ${serverPort}.`);
    
    if (args.dashboard || args.d) {
      openBrowser(`http://localhost:${serverPort}/dashboard`);
    }
    return;
  }

  const targetArg = (args.target || args.t) as string | undefined;
  const execArg = (args.exec || args.e || subcommand) as string | undefined;

  if (!targetArg && !execArg) {
    showHelp();
    return;
  }

  console.log(`[HoverSource] Starting...`);
  const serverPort = await resolveCompanionPort(requestedPort);
  await startCompanionServer({ port: serverPort, projectRoot, debugPort });
  console.log(`[HoverSource] Companion server running on port ${serverPort}.`);

  if (targetArg) {
    const safeTarget = validateSafeUrl(targetArg);
    const isTargetUp = await checkTargetUrlUp(safeTarget);
    if (!isTargetUp) {
      console.warn(`\x1b[33m[HoverSource] ⚠️  WARNING: Target server at ${safeTarget} is not responding.\x1b[0m`);
      console.warn(`[HoverSource] If your dev server starts slowly, HoverSource will automatically retry requests.`);
    }
    await runProxyMode(safeTarget, serverPort, args);
  } else if (execArg) {
    await handleExecMode(execArg, subcommand, projectRoot, debugPort, serverPort, args);
  }
}

function showHelp() {
  console.log(`
Usage: hs [subcommand] [options]

Subcommands:
  start                  Start the companion server only.
  dev, start, etc.       Any package.json script name to execute with HoverSource overlay.

Options:
  -p, --port=<port>       Port for the companion server (default: 7300)
  -t, --target=<url>      Direct target dev server URL to proxy (e.g. http://localhost:3000)
  -e, --exec=<command>    Command to launch target app (e.g. "npm run dev", "electron .")
  -r, --root=<path>       Project root directory (default: current directory)
  -d, --dashboard         Automatically open the HoverSource Dashboard in your browser
  -h, --help              Show this help message
  --debug-port=<port>     CDP Remote debugging port for Electron (default: 9222)
  --proxy-port=<port>     Explicit port to bind HoverSource reverse proxy server
  --auto-resolve          Automatically resolve port conflicts (terminate process or patch debug port)
`);
}

try {
  await main();
} catch (err) {
  console.error(`[HoverSource] CLI Fatal Error:`, err);
  process.exit(1);
}