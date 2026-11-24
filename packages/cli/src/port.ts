/**
 * Port resolution module for HoverSource CLI.
 *
 * Consolidates all port-checking, port-finding, and conflict-resolution logic.
 * The two main entry points are:
 *   - `resolveDevServerPort()` — ensures the dev port is free and returns env/args to inject
 *   - `resolveAllPorts()` — one-shot collision-free resolution of all ports HS needs
 */

import { exec } from "node:child_process";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import readline from "node:readline";
import type { CompanionConflictPolicy, HoverSourceConfig } from "@hoversource/companion-server/config";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface DevServerPortResult {
  /** The port the dev server will actually listen on. */
  port: number;
  /** Env vars to inject into the spawned process (e.g. { PORT: "5174" }). */
  env: Record<string, string>;
  /** Extra CLI args for frameworks that prefer --port (appended to spawn args). */
  extraArgs: string[];
}

export interface PortPlan {
  companionPort: number;
  devServerPort: number;
  debugPort: number;
  proxyPort: number;
  /** Env vars to inject into the spawned dev server process. */
  devServerEnv: Record<string, string>;
  /** Extra CLI args to append to the spawned dev server command. */
  devServerExtraArgs: string[];
}

export class CliUsageError extends Error {
  public readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export interface PortPrecedenceResult {
  companionPort: number;
  debugPort: number;
  proxyPort: number | undefined;
  devPort: number | undefined;
  companionConflict: CompanionConflictPolicy;
  autoResolve: boolean;
}

export interface CompanionStatusInfo {
  isHoverSource: true;
  legacy: boolean;
  pid?: number;
  port?: number;
  projectRoot?: string;
  debugPort?: number;
}

export interface ResolveCompanionPortOptions {
  requestedPort: number;
  projectRoot?: string;
  excludePorts?: number[];
  conflictPolicy?: CompanionConflictPolicy;
  probeStatusFn?: (port: number, timeoutMs?: number) => Promise<CompanionStatusInfo | null>;
}

// ---------------------------------------------------------------------------
//  Low-level primitives (moved from cli.ts)
// ---------------------------------------------------------------------------

export function probeHostPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(false);
      } else {
        // Other errors (e.g. EADDRNOTAVAIL for IPv6 on some systems) do not mean the port is in use
        resolve(true);
      }
    });
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function isPortFree(port: number): Promise<boolean> {
  if (!await probeHostPort(port, "127.0.0.1")) return false;
  if (!await probeHostPort(port, "localhost")) return false;
  if (!await probeHostPort(port, "::1")) return false;
  if (!await probeHostPort(port, "0.0.0.0")) return false;
  if (!await probeHostPort(port, "::")) return false;
  return true;
}

export async function findFreePort(startPort: number, excludePorts?: number | number[], maxPort = 65535): Promise<number> {
  let excludeArray: number[] = [];
  if (excludePorts !== undefined) {
    excludeArray = Array.isArray(excludePorts) ? excludePorts : [excludePorts];
  }
  const excluded = new Set(excludeArray);
  let port = startPort;
  while (port <= maxPort) {
    if (excluded.has(port)) {
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

export function parseNetstatListeningPid(stdout: string, port: number): number | undefined {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    if (parts[3]?.toUpperCase() !== "LISTENING") continue;

    const localAddr = parts[1];
    const lastColon = localAddr.lastIndexOf(":");
    if (lastColon === -1) continue;
    const portToken = localAddr.slice(lastColon + 1);
    if (!/^\d+$/.test(portToken) || Number(portToken) !== port) continue;

    const pidStr = parts[4];
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isNaN(pid) && pid > 0) {
      return pid;
    }
  }
  return undefined;
}

export function getPidUsingPort(port: number): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec("netstat -ano", { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        resolve(parseNetstatListeningPid(stdout, port));
      });
    } else {
      exec(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        for (const line of stdout.trim().split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!/^\d+$/.test(trimmed)) continue;
          const pid = Number.parseInt(trimmed, 10);
          if (!Number.isNaN(pid) && pid > 0) {
            return resolve(pid);
          }
        }
        resolve(undefined);
      });
    }
  });
}

export function getProcessName(pid: number): Promise<string | undefined> {
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

export function killProcess(pid: number, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
    exec(cmd, (err, _stdout, stderr) => {
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

export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

export function isZombieOfProject(pid: number, projectRoot: string): Promise<boolean> {
  return new Promise((resolve) => {
    const normalizedRoot = path.normalize(projectRoot).toLowerCase();
    
    if (process.platform === "win32") {
      exec(`wmic process where processid=${pid} get CommandLine /format:list`, (err, stdout) => {
        if (err || !stdout) {
          exec(`powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty CommandLine"`, (psErr, psStdout) => {
            if (psErr || !psStdout) return resolve(false);
            const cmd = psStdout.trim().toLowerCase();
            resolve(cmd.includes(normalizedRoot));
          });
          return;
        }
        const cmd = stdout.trim().toLowerCase();
        resolve(cmd.includes(normalizedRoot));
      });
    } else {
      exec(`ps -p ${pid} -o args=`, (err, stdout) => {
        if (!err && stdout?.toLowerCase().includes(normalizedRoot)) {
          return resolve(true);
        }
        exec(`lsof -a -d cwd -p ${pid} -fn`, (lsofErr, lsofStdout) => {
          if (lsofErr || !lsofStdout) return resolve(false);
          resolve(lsofStdout.toLowerCase().includes(normalizedRoot));
        });
      });
    }
  });
}

// ---------------------------------------------------------------------------
//  Port precedence & validation
// ---------------------------------------------------------------------------

function parseStrictPortFlag(raw: string | boolean | undefined, flagName: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    throw new CliUsageError(
      `[HoverSource] Invalid ${flagName} value: "${String(raw)}". Expected an integer between 1 and 65535.`
    );
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (parsed < 1 || parsed > 65535) {
    throw new CliUsageError(
      `[HoverSource] Invalid ${flagName} value: ${parsed}. Port must be between 1 and 65535.`
    );
  }
  return parsed;
}

export function resolvePortPrecedence(
  args: Record<string, string | boolean | undefined>,
  mergedConfig: Partial<HoverSourceConfig> = {}
): PortPrecedenceResult {
  const cliCompanion = parseStrictPortFlag(args.port ?? args.p, "--port");
  const cliDebug = parseStrictPortFlag(args["debug-port"], "--debug-port");
  const cliProxy = parseStrictPortFlag(args["proxy-port"], "--proxy-port");
  const cliDev = parseStrictPortFlag(args["dev-port"], "--dev-port");

  const ports = mergedConfig.ports;
  const companionPort = cliCompanion ?? ports?.companion ?? 7300;
  const debugPort = cliDebug ?? ports?.debug ?? 9222;
  const proxyPort = cliProxy ?? ports?.proxy ?? undefined;
  const devPort = cliDev ?? ports?.dev ?? undefined;
  const companionConflict: CompanionConflictPolicy = ports?.companionConflict ?? "shift";

  let autoResolve = mergedConfig.autoResolvePortConflicts === true;
  if (args["auto-resolve"] !== undefined) {
    autoResolve = args["auto-resolve"] === true || args["auto-resolve"] === "true";
  }

  return {
    companionPort,
    debugPort,
    proxyPort,
    devPort,
    companionConflict,
    autoResolve,
  };
}

// ---------------------------------------------------------------------------
//  Companion port resolution (moved from cli.ts)
// ---------------------------------------------------------------------------

function httpGetText(url: string, timeoutMs: number): Promise<{ statusCode: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

export async function probeCompanionStatus(port: number, timeoutMs = 1500): Promise<CompanionStatusInfo | null> {
  const statusRes = await httpGetText(`http://127.0.0.1:${port}/status`, timeoutMs);
  if (statusRes && statusRes.statusCode >= 200 && statusRes.statusCode < 300) {
    try {
      const parsed = JSON.parse(statusRes.body);
      if (parsed && parsed.ok === true) {
        return {
          isHoverSource: true,
          legacy: false,
          pid: typeof parsed.pid === "number" ? parsed.pid : undefined,
          port: typeof parsed.port === "number" ? parsed.port : undefined,
          projectRoot: typeof parsed.projectRoot === "string" ? parsed.projectRoot : undefined,
          debugPort: typeof parsed.debugPort === "number" ? parsed.debugPort : undefined,
        };
      }
    } catch {
      // Fall back to /ping when /status returns non-JSON
    }
  }

  const pingRes = await httpGetText(`http://127.0.0.1:${port}/ping`, timeoutMs);
  if (pingRes && pingRes.statusCode >= 200 && pingRes.statusCode < 300 && pingRes.body.trim() === "pong") {
    return {
      isHoverSource: true,
      legacy: true,
    };
  }

  return null;
}

async function shutdownAndWaitForFree(port: number, maxWaitMs = 3000): Promise<boolean> {
  await httpGetText(`http://127.0.0.1:${port}/shutdown`, 1500);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return isPortFree(port);
}

function normalizeForCompare(p: string): string {
  const normalized = path.normalize(path.resolve(p));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function formatCompanionOwner(status: CompanionStatusInfo): string {
  const projPart = status.projectRoot ? `project "${status.projectRoot}"` : "another HoverSource instance";
  const pidPart = status.pid !== undefined ? ` (PID: ${status.pid})` : "";
  return `${projPart}${pidPart}`;
}

/**
 * If the requested port is occupied by another HoverSource instance, handle it
 * according to project identity and `conflictPolicy` (`"shift"` | `"takeover"` | `"fail"`).
 * Returns the port we should actually bind to.
 */
export async function resolveCompanionPort(requestedPort: number, targetPort?: number): Promise<number>;
export async function resolveCompanionPort(opts: ResolveCompanionPortOptions): Promise<number>;
export async function resolveCompanionPort(
  portOrOpts: number | ResolveCompanionPortOptions,
  legacyTargetPort?: number
): Promise<number> {
  const isLegacyCall = typeof portOrOpts === "number";
  const requestedPort = isLegacyCall ? portOrOpts : portOrOpts.requestedPort;
  const projectRoot = isLegacyCall ? undefined : portOrOpts.projectRoot;
  const excludePorts = isLegacyCall
    ? (legacyTargetPort !== undefined ? [legacyTargetPort] : [])
    : (portOrOpts.excludePorts ?? []);
  const conflictPolicy: CompanionConflictPolicy = isLegacyCall
    ? "takeover"
    : (portOrOpts.conflictPolicy ?? "shift");
  const probeStatusFn = isLegacyCall
    ? probeCompanionStatus
    : (portOrOpts.probeStatusFn ?? probeCompanionStatus);

  if (excludePorts.includes(requestedPort)) {
    if (isLegacyCall) {
      console.log(`[HoverSource] Requested companion port ${requestedPort} conflicts with target application port ${legacyTargetPort}. Shifting...`);
      return findFreePort(7300, legacyTargetPort);
    }
    console.log(`[HoverSource] Requested companion port ${requestedPort} conflicts with reserved port(s). Shifting...`);
    return findFreePort(requestedPort + 1, excludePorts);
  }

  const free = await isPortFree(requestedPort);
  if (free) return requestedPort;

  const status = await probeStatusFn(requestedPort);
  if (status) {
    const isSameProject =
      !status.legacy &&
      Boolean(projectRoot && status.projectRoot) &&
      normalizeForCompare(status.projectRoot!) === normalizeForCompare(projectRoot!);

    if (isSameProject) {
      console.log(`[HoverSource] Previous instance for this project found on port ${requestedPort}. Replacing...`);
      if (await shutdownAndWaitForFree(requestedPort)) {
        return requestedPort;
      }
      console.log(`[HoverSource] Previous instance on port ${requestedPort} could not be terminated (ghost port). Shifting...`);
      return findFreePort(requestedPort + 1, excludePorts);
    }

    const ownerDesc = formatCompanionOwner(status);
    if (conflictPolicy === "fail") {
      throw new Error(
        `[HoverSource] Companion port ${requestedPort} is already in use by ${ownerDesc}. ` +
        `Use --port=<free-port> or set ports.companionConflict to "shift" or "takeover".`
      );
    }

    if (conflictPolicy === "takeover") {
      console.log(`[HoverSource] Companion port ${requestedPort} is in use by ${ownerDesc}. Taking over...`);
      if (await shutdownAndWaitForFree(requestedPort)) {
        return requestedPort;
      }
      console.log(`[HoverSource] Previous instance on port ${requestedPort} could not be terminated (ghost port). Shifting...`);
      return findFreePort(requestedPort + 1, excludePorts);
    }

    // Default: "shift"
    console.log(`[HoverSource] Companion port ${requestedPort} is in use by ${ownerDesc}. Shifting to next free port...`);
    return findFreePort(requestedPort + 1, excludePorts);
  }

  const pid = await getPidUsingPort(requestedPort);
  const procName = pid ? await getProcessName(pid) : undefined;
  const ownerDesc = `${procName || "another process"}${pid !== undefined ? ` (PID: ${pid})` : ""}`;

  if (conflictPolicy === "fail") {
    throw new Error(
      `[HoverSource] Companion port ${requestedPort} is occupied by ${ownerDesc}. ` +
      `Use --port=<free-port> or close the process.`
    );
  }

  console.log(`[HoverSource] Port ${requestedPort} in use by ${ownerDesc}, using next free port.`);
  return findFreePort(requestedPort + 1, excludePorts);
}

export async function bindServerWithRetry<T>(
  bindFn: (port: number) => Promise<T>,
  opts: {
    initialPort: number;
    excludePorts?: number[];
    maxAttempts?: number;
  }
): Promise<{ port: number; result: T }> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const triedPorts = new Set<number>(opts.excludePorts ?? []);
  let currentPort = opts.initialPort;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await bindFn(currentPort);
      return { port: currentPort, result };
    } catch (err: any) {
      const code = err?.code;
      const isRetryable = code === "EADDRINUSE" || code === "EACCES";
      if (!isRetryable || attempt >= maxAttempts - 1) {
        throw err;
      }
      triedPorts.add(currentPort);
      currentPort = await findFreePort(currentPort + 1, Array.from(triedPorts));
    }
  }

  throw new Error(`[HoverSource] Failed to bind server after ${maxAttempts} attempts.`);
}

// ---------------------------------------------------------------------------
//  Framework detection for port injection
// ---------------------------------------------------------------------------

type Framework = "vite" | "next" | "nuxt" | "angular" | "cra" | "webpack" | "generic";

function detectFrameworkFromScript(scriptCmd: string): Framework | null {
  if (scriptCmd.includes("vite") && !scriptCmd.includes("electron")) return "vite";
  if (scriptCmd.includes("next")) return "next";
  if (scriptCmd.includes("nuxt")) return "nuxt";
  if (scriptCmd.includes("ng ") || scriptCmd.includes("@angular")) return "angular";
  if (scriptCmd.includes("react-scripts")) return "cra";
  if (scriptCmd.includes("webpack")) return "webpack";
  return null;
}

function detectFrameworkFromDeps(allDeps: Record<string, string>): Framework {
  if ("vite" in allDeps || "@sveltejs/kit" in allDeps) return "vite";
  if ("next" in allDeps) return "next";
  if ("nuxt" in allDeps) return "nuxt";
  if ("@angular/cli" in allDeps || "@angular/core" in allDeps) return "angular";
  if ("react-scripts" in allDeps) return "cra";
  if ("webpack-dev-server" in allDeps) return "webpack";
  return "generic";
}

/**
 * Detect which framework the project uses, to know how to inject the port.
 */
function detectFramework(projectRoot: string, execCommand?: string): Framework {
  const pkgPath = path.join(projectRoot, "package.json");
  let allDeps: Record<string, string> = {};
  let scriptCmd = "";

  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (execCommand) {
        const npmRunMatch = /^(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?([^\s]+)/.exec(execCommand);
        scriptCmd = (npmRunMatch && pkg.scripts?.[npmRunMatch[1]])
          ? pkg.scripts[npmRunMatch[1]].toLowerCase()
          : execCommand.toLowerCase();
      }
    }
  } catch {}

  const fromScript = detectFrameworkFromScript(scriptCmd);
  if (fromScript) return fromScript;

  return detectFrameworkFromDeps(allDeps);
}

/**
 * Build the env vars and extra CLI args needed to tell a specific framework
 * to use a particular port.
 */
function buildPortInjection(framework: Framework, port: number): { env: Record<string, string>; extraArgs: string[] } {
  // PORT env is a universal fallback — most Node frameworks read it
  const env: Record<string, string> = { PORT: String(port) };
  const extraArgs: string[] = [];

  switch (framework) {
    case "vite":
      // Vite: PORT env is not read by default; it needs --port or VITE_PORT hack.
      // However, if vite.config.ts hardcodes `server.port`, only --port overrides it.
      // We don't append --port to the user's command directly (they might use npm run dev),
      // so we inject via env. Vite 5+ respects `--port` in the script, and we also set PORT.
      env.VITE_PORT = String(port);
      break;
    case "next":
      // Next.js reads PORT env natively since v13+
      break;
    case "nuxt":
      // Nuxt reads PORT and NUXT_PORT
      env.NUXT_PORT = String(port);
      break;
    case "angular":
      // Angular CLI doesn't read PORT env, but we set it anyway for NODE_OPTIONS.
      // The real mechanism is the --port flag, but that requires modifying the npm script.
      break;
    case "cra":
      // CRA reads PORT env natively
      break;
    case "webpack":
      // webpack-dev-server reads --port but not PORT env by default.
      // Setting PORT anyway since many setups use it via custom scripts.
      break;
    case "generic":
      break;
  }

  return { env, extraArgs };
}

// ---------------------------------------------------------------------------
//  Dev server port conflict resolution
// ---------------------------------------------------------------------------

export async function resolveDebugPort(opts: {
  debugPort: number;
  projectRoot: string;
  excludePorts?: number[];
}): Promise<number> {
  const { debugPort, projectRoot, excludePorts = [] } = opts;
  const isExcluded = excludePorts.includes(debugPort);
  if (!isExcluded && (await isPortFree(debugPort))) {
    return debugPort;
  }

  const pid = isExcluded ? undefined : await getPidUsingPort(debugPort);
  if (pid && (await isZombieOfProject(pid, projectRoot))) {
    console.log(`[HoverSource] Detected zombie process from this project occupying debug port ${debugPort} (PID: ${pid}). Terminating...`);
    const killed = await killProcess(pid, debugPort);
    if (killed && (await isPortFree(debugPort))) {
      return debugPort;
    }
  }

  const procName = pid ? await getProcessName(pid) : undefined;
  const nextPort = await findFreePort(debugPort + 1, [...excludePorts, debugPort]);
  const ownerInfo = procName || pid ? ` by ${procName || "Unknown"}${pid ? ` (PID: ${pid})` : ""}` : "";
  console.log(`[HoverSource] Debug port ${debugPort} in use${ownerInfo}; using ${nextPort}.`);
  return nextPort;
}

async function handleElectronBlocker(
  pid: number,
  procName: string | undefined,
  expectedPort: number,
  autoResolve: boolean,
  framework: Framework
): Promise<DevServerPortResult> {
  const ownerDesc = `${procName || "Unknown"} (PID: ${pid})`;
  if (!autoResolve) {
    throw new Error(
      `[HoverSource] Dev server port ${expectedPort} is occupied by ${ownerDesc}. ` +
      `Electron projects require this port and cannot shift. ` +
      `Close the process, pass --auto-resolve, or run: hs config set autoResolvePortConflicts true`
    );
  }

  console.log(`[HoverSource] Auto-resolving Electron dev port ${expectedPort} conflict: terminating ${ownerDesc}...`);
  const success = await killProcess(pid, expectedPort);
  if (!success) {
    throw new Error(
      `[HoverSource] Failed to terminate ${ownerDesc} on Electron dev port ${expectedPort}. ` +
      `Please close the process manually or run as administrator.`
    );
  }

  console.log(`[HoverSource] Port ${expectedPort} is now free.`);
  const injection = buildPortInjection(framework, expectedPort);
  return { port: expectedPort, ...injection };
}

/**
 * Ensures the dev server port is free before the app launches.
 *
 * Two distinct strategies based on mode:
 * - **web**: Shift to next free port + inject PORT/VITE_PORT env vars. Works because
 *   web frameworks read these env vars to determine which port to bind.
 * - **electron**: MUST free the original port. Port shifting won't work because Electron
 *   projects embed the dev server inside concurrently/scripts with hardcoded port references
 *   (e.g. VITE_DEV_SERVER_URL=http://localhost:5173). For Electron, the function will:
 *   1. Auto-kill zombie processes from the same project
 *   2. Prompt to kill any other blocker (default: YES, since there's no alternative)
 *   3. In non-interactive mode, auto-kill the blocker
 */
export async function resolveDevServerPort(opts: {
  projectRoot: string;
  execCommand: string;
  expectedPort: number;
  mode: "web" | "electron";
  autoResolve: boolean;
  /** Ports already claimed by other HS subsystems — will be excluded from candidates. */
  excludePorts?: number[];
}): Promise<DevServerPortResult> {
  const { projectRoot, execCommand, expectedPort, mode, autoResolve, excludePorts = [] } = opts;
  const framework = detectFramework(projectRoot, execCommand);

  // 1. Check if expected port is free
  const free = await isPortFree(expectedPort);
  if (free && !excludePorts.includes(expectedPort)) {
    // Port is free, return it with injection info (even though the port matches default,
    // we still inject env so the dev server explicitly binds to it — prevents race conditions)
    const injection = buildPortInjection(framework, expectedPort);
    return { port: expectedPort, ...injection };
  }

  // 2. Try to identify and handle the blocker
  const pid = await getPidUsingPort(expectedPort);
  if (pid) {
    const procName = await getProcessName(pid);

    // 2a. If blocker is a zombie from this project, auto-kill it regardless of mode
    const zombie = await isZombieOfProject(pid, projectRoot);
    if (zombie) {
      console.log(`[HoverSource] Detected zombie process from this project occupying port ${expectedPort} (PID: ${pid}). Automatically terminating it...`);
      const success = await killProcess(pid, expectedPort);
      if (success) {
        console.log(`[HoverSource] Port ${expectedPort} is now free.`);
        await new Promise((r) => setTimeout(r, 700));
        const injection = buildPortInjection(framework, expectedPort);
        return { port: expectedPort, ...injection };
      }
    }

    // 2b. For electron mode, handle the blocker appropriately
    if (mode === "electron") {
      return handleElectronBlocker(pid, procName, expectedPort, autoResolve, framework);
    }
  } else if (mode === "electron") {
    throw new Error(
      `[HoverSource] Dev server port ${expectedPort} is unavailable. ` +
      `Electron projects require this port and cannot shift. ` +
      `Free the port, pass --auto-resolve, or run: hs config set autoResolvePortConflicts true`
    );
  }

  // 3. Web mode: shift to next free port (non-destructive resolution)
  //    This works because we inject PORT/VITE_PORT env vars that web frameworks read.
  const newPort = await findFreePort(expectedPort + 1, [...excludePorts, expectedPort]);
  console.log(`[HoverSource] Port ${expectedPort} is occupied. Using next free port: ${newPort}`);
  const injection = buildPortInjection(framework, newPort);
  return { port: newPort, ...injection };
}

// ---------------------------------------------------------------------------
//  One-shot all-ports resolution
// ---------------------------------------------------------------------------

/**
 * Resolves all ports HS needs in one call. Guarantees no collisions between
 * companion, dev server, debug, and proxy ports. Returns a PortPlan.
 */
export async function resolveAllPorts(opts: {
  projectRoot: string;
  execCommand?: string;
  requestedCompanionPort: number;
  expectedDevPort: number;
  debugPort: number;
  requestedProxyPort?: number;
  mode: "web" | "electron";
  autoResolve: boolean;
}): Promise<PortPlan> {
  const {
    projectRoot,
    execCommand,
    requestedCompanionPort,
    expectedDevPort,
    debugPort,
    requestedProxyPort,
    mode,
    autoResolve
  } = opts;

  // 1. Resolve companion port first (it's HS's own server, highest priority)
  const companionPort = await resolveCompanionPort(requestedCompanionPort, expectedDevPort);

  // 2. Resolve dev server port, excluding companion
  const devResult = await resolveDevServerPort({
    projectRoot,
    execCommand: execCommand || "",
    expectedPort: expectedDevPort,
    mode,
    autoResolve,
    excludePorts: [companionPort]
  });

  // 3. Resolve debug port (for Electron), excluding companion + dev
  let resolvedDebugPort = debugPort;
  if (mode === "electron") {
    const debugFree = await isPortFree(debugPort);
    if (!debugFree || debugPort === companionPort || debugPort === devResult.port) {
      resolvedDebugPort = await findFreePort(
        debugPort + 1,
        [companionPort, devResult.port]
      );
      if (resolvedDebugPort !== debugPort) {
        console.log(`[HoverSource] Debug port ${debugPort} unavailable, using ${resolvedDebugPort}.`);
      }
    }
  }

  // 4. Resolve proxy port, excluding all three above
  const defaultProxyPort = requestedProxyPort ?? (10000 + devResult.port);
  const usedPorts = [companionPort, devResult.port, resolvedDebugPort];
  let proxyPort = defaultProxyPort;
  if (!await isPortFree(proxyPort) || usedPorts.includes(proxyPort)) {
    proxyPort = await findFreePort(defaultProxyPort + 1, usedPorts);
    if (proxyPort !== defaultProxyPort) {
      console.log(`[HoverSource] Proxy port ${defaultProxyPort} unavailable, using ${proxyPort}.`);
    }
  }

  return {
    companionPort,
    devServerPort: devResult.port,
    debugPort: resolvedDebugPort,
    proxyPort,
    devServerEnv: devResult.env,
    devServerExtraArgs: devResult.extraArgs
  };
}
