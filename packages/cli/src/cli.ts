#!/usr/bin/env node

import { startCompanionServer, loadMergedConfig } from "@hoversource/companion-server";
import { injectOverlayScript, type InjectOverlayOptions } from "@hoversource/client-injector";
import { startProxy } from "./proxy.js";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { restoreLeftoverPatches } from "./utils/patchState.js";
import { setupConsoleMonkeypatch } from "./utils/logger.js";
import { parseCliArgs } from "./args.js";
import { runDashboardCommand } from "./commands/dashboard.js";
import { runConfigCommand } from "./commands/config.js";
import { checkForUpdate, runUpdateCommand } from "./update.js";
import {
  CliUsageError,
  findFreePort,
  resolveCompanionPort,
  resolvePortPrecedence,
  resolveDebugPort,
  bindServerWithRetry,
} from "./port.js";

// Re-export port functions for backward compatibility
export {
  CliUsageError,
  isPortFree,
  findFreePort,
  getPidUsingPort,
  getProcessName,
  killProcess,
  askQuestion,
  isZombieOfProject,
  resolveCompanionPort,
  resolveDevServerPort,
  resolveAllPorts,
  resolvePortPrecedence,
  resolveDebugPort,
  bindServerWithRetry,
} from "./port.js";
export type { DevServerPortResult, PortPlan, PortPrecedenceResult, CompanionStatusInfo } from "./port.js";
import { WebProxyLauncher } from "./launcher/WebProxyLauncher.js";
import { ElectronCdpLauncher } from "./launcher/ElectronCdpLauncher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedCliVersion: string | null = null;
export function getCliVersion(): string {
  if (cachedCliVersion) return cachedCliVersion;
  try {
    const pkgPath = path.resolve(__dirname, "../package.json");
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: unknown };
    cachedCliVersion = typeof parsed.version === "string" && parsed.version.trim() !== ""
      ? parsed.version.trim()
      : "0.0.0";
  } catch {
    cachedCliVersion = "0.0.0";
  }
  return cachedCliVersion;
}

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

function resolveActualCmd(projectRoot: string, execCommand: string): string {
  const npmRunMatch = /^(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?([^\s]+)/.exec(execCommand);
  if (npmRunMatch) {
    const scriptName = npmRunMatch[1];
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.scripts?.[scriptName]) {
          return pkg.scripts[scriptName];
        }
      } catch {}
    }
  }
  return execCommand;
}

function findConfigPath(actualCmd: string): string | undefined {
  const configMatch = /(?:--config|-c)\s+([^\s"'\\]+)/.exec(actualCmd);
  if (configMatch) return configMatch[1];
  
  const fileMatch = /([\w\-./\\]+?\.config\.[jt]s)/.exec(actualCmd);
  return fileMatch ? fileMatch[1] : undefined;
}

function readPortFromConfig(projectRoot: string, configPath: string): number | undefined {
  const fullPath = path.resolve(projectRoot, configPath);
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const portMatch = /port:\s*(\d+)/.exec(content);
      if (portMatch) {
        return Number.parseInt(portMatch[1], 10);
      }
    } catch {}
  }
  return undefined;
}

function findPortFromExecCommand(projectRoot: string, execCommand: string): number | undefined {
  const actualCmd = resolveActualCmd(projectRoot, execCommand);
  const configPath = findConfigPath(actualCmd);
  if (configPath) {
    return readPortFromConfig(projectRoot, configPath);
  }
  return undefined;
}

function findPortFromRootConfigs(projectRoot: string): number | undefined {
  const commonConfigs = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"];
  for (const file of commonConfigs) {
    try {
      const fullPath = path.join(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const portMatch = /port:\s*(\d+)/.exec(content);
        if (portMatch) {
          return Number.parseInt(portMatch[1], 10);
        }
      }
    } catch {}
  }
  return undefined;
}

function findPortFromDependencies(projectRoot: string): number | undefined {
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if ("next" in allDeps) return 3000;
      if ("nuxt" in allDeps) return 3000;
      if ("vite" in allDeps) return 5173;
      if ("@sveltejs/kit" in allDeps) return 5173;
      if ("@angular/cli" in allDeps || "@angular/core" in allDeps) return 4200;
      if ("webpack-dev-server" in allDeps) return 8080;
    }
  } catch {}
  return undefined;
}

export function detectDevServerPort(projectRoot: string, execCommand?: string): number {
  let configPort: number | undefined;

  if (execCommand) {
    configPort = findPortFromExecCommand(projectRoot, execCommand);
  }

  if (!configPort) {
    configPort = findPortFromRootConfigs(projectRoot);
  }

  if (!configPort) {
    configPort = findPortFromDependencies(projectRoot);
  }

  return configPort ?? 3000;
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
// On-disk patching functions moved to patcher/ReactRuntimePatcher.ts and utils/patchState.ts

export async function runProxyMode(
  targetUrl: string,
  serverPort: number,
  args: any,
  options?: { proxyPort?: number; excludePorts?: number[] }
): Promise<void> {
  let targetPort = 3000;
  try {
    targetPort = Number.parseInt(new URL(targetUrl).port || "3000", 10);
  } catch (err) {
    console.debug("[HoverSource] Failed to parse target port:", err);
  }
  const requestedProxyPort =
    options?.proxyPort ??
    (args["proxy-port"] ? Number.parseInt(String(args["proxy-port"]), 10) : 10000 + targetPort);
  const excludePorts = options?.excludePorts ?? [serverPort, targetPort];
  const initialProxyPort = await findFreePort(requestedProxyPort, excludePorts);
  if (initialProxyPort !== requestedProxyPort) {
    console.log(`[HoverSource] Proxy port ${requestedProxyPort} in use, using ${initialProxyPort} instead.`);
  }
  const overlayScriptUrl = "/hoversource/hoversource-overlay.js";
  const useHttps = targetUrl.toLowerCase().startsWith("https:");

  try {
    const { port: boundProxyPort } = await bindServerWithRetry(
      (port) =>
        startProxy({
          targetUrl,
          proxyPort: port,
          companionPort: serverPort,
          overlayScriptUrl,
          useHttps,
        }),
      { initialPort: initialProxyPort, excludePorts }
    );
    console.log(`[HoverSource] Proxy mode: ${targetUrl} → ${useHttps ? "https" : "http"}://localhost:${boundProxyPort}`);
    console.log(`[HoverSource] Proxy ready. Opening ${useHttps ? "https" : "http"}://localhost:${boundProxyPort} in your browser...`);
    openBrowser(`${useHttps ? "https" : "http"}://localhost:${boundProxyPort}`);
  } catch (err: any) {
    const isAddrInUse = err?.code === "EADDRINUSE";
    console.error(`[HoverSource] Proxy failed to start on port ${initialProxyPort}.`);
    if (isAddrInUse) {
      console.error(`[HoverSource] Port ${initialProxyPort} is in use. Pass --proxy-port=<port> or close the process using it.`);
    } else {
      console.error(`[HoverSource] Error: ${err?.message || err}`);
    }
    console.error(`[HoverSource] The companion server is still running. You can open http://localhost:${serverPort}/dashboard directly.`);
  }
}

export async function waitForServer(
  port: number,
  timeoutMs = 120_000,
  hasExitedCheck?: () => boolean
): Promise<boolean> {
  const start = Date.now();
  let dots = 0;
  while (Date.now() - start < timeoutMs) {
    if (hasExitedCheck?.()) {
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

// runWebAppMode has been moved to launcher/WebProxyLauncher.ts

export function cleanArgument(arg: string): string {
  const first = arg[0];
  if ((first === '"' || first === "'") && arg.endsWith(first)) {
    return arg.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return arg;
}

export function parseCommand(cmdString: string): { command: string; args: string[] } {
  const matches = cmdString.match(/[^"'\s]+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) || [];
  const parts = matches.map(cleanArgument);
  return {
    command: parts[0] || "",
    args: parts.slice(1),
  };
}

export function resolveWindowsCommand(command: string): string {
  if (process.platform === "win32") {
    const commonCmds = ["npm", "npx", "yarn", "pnpm", "gulp", "tsc"];
    if (commonCmds.includes(command.toLowerCase())) {
      return `${command}.cmd`;
    }
  }
  return command;
}

export function findScriptPath(projectRoot: string): string {
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

export interface CdpInjectionWatchOptions {
  companionPort?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  injectFn?: (
    port: number,
    scriptContent: string,
    options?: InjectOverlayOptions
  ) => Promise<number>;
}

export async function startCdpInjectionWatch(
  debugPort: number,
  scriptWithPort: string,
  optionsOrCompanionPort?: number | CdpInjectionWatchOptions
): Promise<void> {
  const options =
    typeof optionsOrCompanionPort === "object" && optionsOrCompanionPort !== null
      ? optionsOrCompanionPort
      : undefined;
  const companionPort =
    typeof optionsOrCompanionPort === "number"
      ? optionsOrCompanionPort
      : options?.companionPort;
  const rawInterval = options?.pollIntervalMs;
  const intervalMs =
    typeof rawInterval === "number" && Number.isFinite(rawInterval) && rawInterval > 0
      ? rawInterval
      : 2500;
  const injectFn = options?.injectFn ?? injectOverlayScript;
  const signal = options?.signal;

  if (signal?.aborted) {
    return;
  }

  console.log(`[HoverSource] Watching debug port :${debugPort} for Chromium targets...`);

  let isInjected = false;
  let isPolling = false;

  const pollAndInject = async () => {
    if (isPolling || signal?.aborted) {
      return;
    }
    isPolling = true;
    try {
      const injectOptions: InjectOverlayOptions | undefined =
        companionPort !== undefined ? { companionPort } : undefined;
      const injectedCount = await injectFn(debugPort, scriptWithPort, injectOptions);
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
        console.debug("[HoverSource] Ignored poll injection error:", err?.message ?? err);
      }
    } finally {
      isPolling = false;
    }
  };

  await pollAndInject();
  if (signal?.aborted) {
    return;
  }

  const intervalId = setInterval(pollAndInject, intervalMs);
  intervalId.unref();

  if (signal) {
    const onAbort = () => {
      clearInterval(intervalId);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  }
}

function determineIfElectron(execArg: string, projectRoot: string): boolean {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const hasElectronDep = "electron" in allDeps;
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
        return false;
      }
    }
    return hasElectronDep;
  } catch {
    return false;
  }
}

export async function handleExecMode(
  execArg: string,
  subcommand: string | undefined,
  projectRoot: string,
  debugPort: number,
  serverPort: number,
  args: Record<string, string | boolean>,
  overrides?: {
    resolvedExec?: { execCommand: string; isElectron: boolean };
    devPort?: number;
    proxyPort?: number;
    autoResolve?: boolean;
  }
) {
  let resolved = overrides?.resolvedExec ?? { execCommand: execArg, isElectron: false };
  if (!overrides?.resolvedExec) {
    if (subcommand) {
      const resolvedSub = resolveSubcommand(subcommand, projectRoot);
      if (!resolvedSub) {
        process.exit(1);
      }
      resolved = resolvedSub;
    } else {
      resolved.isElectron = determineIfElectron(execArg, projectRoot);
    }
  }

  const launcher = resolved.isElectron
    ? new ElectronCdpLauncher()
    : new WebProxyLauncher();

  await launcher.launch({
    execCommand: resolved.execCommand,
    projectRoot,
    serverPort,
    debugPort,
    devPort: overrides?.devPort,
    proxyPort: overrides?.proxyPort,
    autoResolve: overrides?.autoResolve,
    args
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

async function startCompanionServerWithRetry(
  initialPort: number,
  projectRoot: string,
  debugPort: number,
  excludePorts: number[] = []
): Promise<number> {
  const { port } = await bindServerWithRetry(
    (portToBind) =>
      new Promise<http.Server>((resolve, reject) => {
        const srv = startCompanionServer({ port: portToBind, projectRoot, debugPort });
        const onListening = () => {
          srv.off("error", onError);
          resolve(srv);
        };
        const onError = (err: Error) => {
          srv.off("listening", onListening);
          reject(err);
        };
        srv.once("listening", onListening);
        srv.once("error", onError);
      }),
    { initialPort, excludePorts }
  );
  return port;
}

async function handleRestartSubcommand(requestedPort: number, projectRoot: string, debugPort: number): Promise<void> {
  console.log(`[HoverSource] Restarting companion server on port ${requestedPort}...`);
  const candidatePort = await resolveCompanionPort({
    requestedPort,
    projectRoot,
    conflictPolicy: "takeover",
  });
  const serverPort = await startCompanionServerWithRetry(candidatePort, projectRoot, debugPort);
  console.log(`[HoverSource] Companion server restarted on port ${serverPort}.`);
}

function checkHasStartScript(projectRoot: string): boolean {
  try {
    const pkgPath = validateSafePath(path.join(projectRoot, "package.json"));
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return !!pkg?.scripts?.start;
    }
  } catch {}
  return false;
}

async function handleTargetOrExec(
  targetArg: string | undefined,
  execArg: string | undefined,
  serverPort: number,
  projectRoot: string,
  debugPort: number,
  args: any,
  subcommand: string | undefined
) {
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

function parsePortFlag(raw: string | boolean | undefined, flagName: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    console.error(`[HoverSource] Invalid ${flagName} value: "${String(raw)}". Expected an integer between 1 and 65535.`);
    process.exit(2);
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (parsed < 1 || parsed > 65535) {
    console.error(`[HoverSource] Invalid ${flagName} value: ${parsed}. Port must be between 1 and 65535.`);
    process.exit(2);
  }
  return parsed;
}

function extractUrlPort(urlStr: string): number {
  const parsed = new URL(validateSafeUrl(urlStr));
  if (parsed.port) {
    return Number.parseInt(parsed.port, 10);
  }
  return parsed.protocol === "https:" ? 443 : 80;
}

async function main() {
  const { args, subcommand, positionals } = parseCliArgs(process.argv.slice(2));
  setupConsoleMonkeypatch({
    stderrOnly: Boolean(args.json),
    noColor: Boolean(args["no-color"] || args.json),
  });
  restoreLeftoverPatches();

  if (args.version || args.V) {
    console.log(getCliVersion());
    return;
  }

  if (args.help || args.h) {
    showHelp();
    return;
  }

  if (subcommand === "update") {
    const code = await runUpdateCommand({
      currentVersion: getCliVersion(),
      dryRun: Boolean(args["dry-run"]),
      json: Boolean(args.json),
    });
    process.exitCode = code;
    return;
  }

  void checkForUpdate({
    currentVersion: getCliVersion(),
    json: Boolean(args.json),
    quiet: Boolean(args.quiet),
  }).then((res) => {
    if (res) {
      process.stderr.write(`\n${res.notice}\n`);
    }
  });

  const projectRoot = validateSafePath(path.resolve(String(args.root || args.r || ".")));
  const mergedConfig = loadMergedConfig(projectRoot);
  let portPrefs;
  try {
    portPrefs = resolvePortPrecedence(args, mergedConfig);
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    throw err;
  }

  const requestedPort = portPrefs.companionPort;
  const debugPort = portPrefs.debugPort;

  const targetArg = (args.target || args.t) as string | undefined;
  const execArg = (args.exec || args.e || subcommand) as string | undefined;

  if (subcommand === "config") {
    const code = await runConfigCommand({
      positionals,
      args,
      projectRoot,
      requestedPort,
    });
    process.exitCode = code;
    return;
  }

  if (subcommand === "dashboard" || (!targetArg && !execArg && Boolean(args.dashboard || args.d))) {
    const result = await runDashboardCommand({
      requestedPort,
      projectRoot,
      debugPort,
      json: Boolean(args.json),
      noOpen: Boolean(args["no-open"]),
    });
    if (!result.keepAlive) {
      process.exit(result.exitCode);
    }
    return;
  }

  const hasStartScript = checkHasStartScript(projectRoot);

  if (subcommand === "restart") {
    await handleRestartSubcommand(requestedPort, projectRoot, debugPort);
    return;
  }

  if (subcommand === "start" && !hasStartScript) {
    console.log(`[HoverSource] Starting companion server...`);
    const candidatePort = await resolveCompanionPort({
      requestedPort,
      projectRoot,
      conflictPolicy: portPrefs.companionConflict,
    });
    const serverPort = await startCompanionServerWithRetry(candidatePort, projectRoot, debugPort);
    console.log(`[HoverSource] Companion server running on port ${serverPort}.`);

    if (args.dashboard || args.d) {
      openBrowser(`http://localhost:${serverPort}/dashboard`);
    }
    return;
  }

  if (!targetArg && !execArg) {
    showHelp();
    return;
  }

  let resolvedExec: { execCommand: string; isElectron: boolean } | undefined;
  if (!targetArg && execArg) {
    if (subcommand) {
      resolvedExec = resolveSubcommand(subcommand, projectRoot);
      if (!resolvedExec) {
        process.exit(1);
      }
    } else {
      resolvedExec = {
        execCommand: execArg,
        isElectron: determineIfElectron(execArg, projectRoot),
      };
    }
  }

  const expectedDevPort =
    portPrefs.devPort ??
    (targetArg
      ? extractUrlPort(targetArg)
      : resolvedExec
        ? detectDevServerPort(projectRoot, resolvedExec.execCommand)
        : undefined);

  const resolvedDebugPort = resolvedExec?.isElectron
    ? await resolveDebugPort({
        debugPort,
        projectRoot,
        excludePorts: expectedDevPort !== undefined ? [expectedDevPort] : [],
      })
    : debugPort;

  const excludeForCompanion = [expectedDevPort, resolvedDebugPort].filter(
    (p): p is number => p !== undefined
  );

  console.log(`[HoverSource] Starting...`);
  const candidatePort = await resolveCompanionPort({
    requestedPort,
    projectRoot,
    excludePorts: excludeForCompanion,
    conflictPolicy: portPrefs.companionConflict,
  });
  const serverPort = await startCompanionServerWithRetry(
    candidatePort,
    projectRoot,
    resolvedDebugPort,
    excludeForCompanion
  );
  console.log(`[HoverSource] Companion server running on port ${serverPort}.`);

  if (targetArg) {
    const safeTarget = validateSafeUrl(targetArg);
    const isTargetUp = await checkTargetUrlUp(safeTarget);
    if (!isTargetUp) {
      console.warn(`\x1b[33m[HoverSource] ⚠️  WARNING: Target server at ${safeTarget} is not responding.\x1b[0m`);
      console.warn(`[HoverSource] If your dev server starts slowly, HoverSource will automatically retry requests.`);
    }
    await runProxyMode(safeTarget, serverPort, args, {
      proxyPort: portPrefs.proxyPort,
      excludePorts: [serverPort, expectedDevPort, resolvedDebugPort].filter(
        (p): p is number => p !== undefined
      ),
    });
  } else if (execArg) {
    await handleExecMode(execArg, subcommand, projectRoot, resolvedDebugPort, serverPort, args, {
      resolvedExec,
      devPort: expectedDevPort,
      proxyPort: portPrefs.proxyPort,
      autoResolve: portPrefs.autoResolve,
    });
  }
}

export function showHelp() {
  console.log(`
Usage: hs [subcommand] [options]

Subcommands:
  start                           Start the companion server only (or run package.json "start").
  restart                         Restart the running companion server.
  dashboard                       Open the HoverSource Dashboard (reuses running server or starts one).
  config <action>                 Inspect or modify settings: list|show|get|set|reset|delete|preset
  config preset <action>          Manage global presets: list|save|use|delete|bind
  update [--dry-run] [--json]     Check npm for a newer hoversource release and install globally
  dev, start, etc.                Any package.json script name to execute with HoverSource overlay.

Options:
  -p, --port=<port>               Port for the companion server (default: 7300)
  -t, --target=<url>              Direct target dev server URL to proxy (e.g. http://localhost:3000)
  -e, --exec=<command>            Command to launch target app (e.g. "npm run dev", "electron .")
  -r, --root=<path>               Project root directory (default: current directory)
  -d, --dashboard                 Open the HoverSource Dashboard (standalone or with a running command)
  --no-open                       Do not automatically open the browser when running dashboard
  --global                        Target global ~/.hoversourcerc (for hs config)
  --local                         Target project .hoversourcerc (for hs config)
  --merged                        Read merged effective config (for hs config list|show|get)
  --dry-run                       Preview config changes without writing disk (for hs config)
  -y, --yes                       Confirm destructive config actions non-interactively
  --json                          Emit machine-readable JSON output to stdout
  -V, --version                   Show HoverSource CLI version
  -h, --help                      Show this help message
  --debug-port=<port>             CDP remote debugging port for Electron (default: 9222)
  --dev-port=<port>               Explicit detected dev server port
  --proxy-port=<port>             Explicit port to bind HoverSource reverse proxy server
  --https                         Serve web reverse proxy over local HTTPS using HoverSource Root CA
  --auto-resolve                  Automatically resolve port conflicts (terminate process or patch debug port)

Configuration (.hoversourcerc):
  Project file: <projectRoot>/.hoversourcerc (overrides global ~/.hoversourcerc; preserve existing keys when editing).

  Static scan rules (apply ONLY to .css/.scss/.sass/.less and .html/.htm lookup, NOT JS/TS component resolution):
    - Unset include: scans repo root minus dot-dirs (.*), node_modules, dist/build/out/coverage, .gitignore, and ignore.
    - Set include (non-empty): whitelist mode. Scans ONLY matching paths (ignores all else), then filters via .gitignore and ignore.
    - Prefer folder prefixes (e.g. ["src"], ["apps/web/src", "packages/ui/src"]) over enumerating individual files or non-style code files.

  Keys (JSON):
    include          string[]   Optional whitelist prefixes/globs for CSS/HTML lookup (omitted by default)
    ignore           string[]   Extra gitignore-style patterns; supports "!pattern" negation (default: [])
    respectGitignore boolean    Apply .gitignore rules during CSS/HTML lookup (default: true)
    ports            object     { companion, debug, proxy, dev, companionConflict: "shift"|"takeover"|"fail" }
    preset           string     Bound global preset name (set via: hs config preset bind <name>)
    theme            string     "dark" | "light" | "system"
    editor           string     "vscode" | "cursor" | "code"

  Setup commands:
    hs config list --merged --json
    hs config set include '["src","packages/ui/src"]'
    hs config set ignore '["legacy/**","*.gen.css"]'
    hs config set respectGitignore true
`);
}

try {
  await main();
} catch (err) {
  console.error(`[HoverSource] CLI Fatal Error:`, err);
  process.exit(1);
}