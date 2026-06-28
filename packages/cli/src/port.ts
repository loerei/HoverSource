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

// ---------------------------------------------------------------------------
//  Low-level primitives (moved from cli.ts)
// ---------------------------------------------------------------------------

export function probeHostPort(port: number, host: string): Promise<boolean> {
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

export function getPidUsingPort(port: number): Promise<number | undefined> {
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
//  Companion port resolution (moved from cli.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
//  Framework detection for port injection
// ---------------------------------------------------------------------------

type Framework = "vite" | "next" | "nuxt" | "angular" | "cra" | "webpack" | "generic";

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

      // Resolve npm run <script> to the actual command
      if (execCommand) {
        const npmRunMatch = /^(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?([^\s]+)/.exec(execCommand);
        if (npmRunMatch && pkg.scripts?.[npmRunMatch[1]]) {
          scriptCmd = pkg.scripts[npmRunMatch[1]].toLowerCase();
        } else {
          scriptCmd = execCommand.toLowerCase();
        }
      }
    }
  } catch {}

  // Check script command first (more specific than deps)
  if (scriptCmd.includes("vite") && !scriptCmd.includes("electron")) return "vite";
  if (scriptCmd.includes("next")) return "next";
  if (scriptCmd.includes("nuxt")) return "nuxt";
  if (scriptCmd.includes("ng ") || scriptCmd.includes("@angular")) return "angular";
  if (scriptCmd.includes("react-scripts")) return "cra";
  if (scriptCmd.includes("webpack")) return "webpack";

  // Fallback to deps
  if ("vite" in allDeps || "@sveltejs/kit" in allDeps) return "vite";
  if ("next" in allDeps) return "next";
  if ("nuxt" in allDeps) return "nuxt";
  if ("@angular/cli" in allDeps || "@angular/core" in allDeps) return "angular";
  if ("react-scripts" in allDeps) return "cra";
  if ("webpack-dev-server" in allDeps) return "webpack";

  return "generic";
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

    // 2b. For electron mode: port shifting won't work because inner scripts (concurrently,
    //     vite, electron) have hardcoded port references. We MUST free the original port.
    if (mode === "electron") {
      console.warn(`\n\x1b[33m[HoverSource] ⚠️  Dev server port ${expectedPort} is occupied by: ${procName || "Unknown"} (PID: ${pid})\x1b[0m`);
      console.warn(`\x1b[33m[HoverSource] Electron projects require the original port — port shifting is not possible.\x1b[0m`);

      // Auto-kill the blocker: either --auto-resolve is set, or we default to killing
      // because there's no other viable option for Electron projects.
      let shouldKill = autoResolve;
      if (shouldKill) {
        console.log(`[HoverSource] --auto-resolve: Automatically terminating blocker on port ${expectedPort}...`);
      } else {
        const isInteractive = process.stdout.isTTY && process.stdin.isTTY;
        if (isInteractive) {
          const answer = await askQuestion(`\x1b[36m[HoverSource] Terminate this process to free port ${expectedPort}? (Y/n): \x1b[0m`);
          // Default to YES (Y/n) — the user must explicitly decline
          shouldKill = answer.trim().toLowerCase() !== "n";
        } else {
          // Non-interactive (CI/piped): auto-kill since port shifting won't work
          shouldKill = true;
          console.log(`[HoverSource] Non-interactive mode. Automatically terminating blocker on port ${expectedPort}...`);
        }
      }

      if (shouldKill) {
        console.log(`[HoverSource] Terminating process ${pid}...`);
        const success = await killProcess(pid, expectedPort);
        if (success) {
          console.log(`[HoverSource] Port ${expectedPort} is now free.`);
          await new Promise((r) => setTimeout(r, 700));
          const injection = buildPortInjection(framework, expectedPort);
          return { port: expectedPort, ...injection };
        }
        console.error(`\x1b[31m[HoverSource] Failed to free port ${expectedPort}. The dev server will likely fail.\x1b[0m`);
        console.error(`[HoverSource] Please close the process manually or run as administrator.`);
      } else {
        console.warn(`\x1b[33m[HoverSource] Proceeding without freeing port ${expectedPort}. The dev server will likely fail.\x1b[0m`);
      }

      // Return the original port anyway — can't shift for Electron
      const injection = buildPortInjection(framework, expectedPort);
      return { port: expectedPort, ...injection };
    }
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
