import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { AppLauncher, LaunchConfig } from "./types.js";
import { ReactRuntimePatcher } from "../patcher/ReactRuntimePatcher.js";
import { loadMergedConfig } from "@hoversource/companion-server";
import {
  detectDevServerPort,
  isPortFree,
  getPidUsingPort,
  getProcessName,
  askQuestion,
  killProcess,
  parseCommand,
  resolveWindowsCommand,
  validateSafeCommand,
  validateSafePath,
  waitForServer,
  runProxyMode
} from "../cli.js";

export class WebProxyLauncher implements AppLauncher {
  private patcher = new ReactRuntimePatcher();

  async launch(config: LaunchConfig): Promise<void> {
    const { execCommand, projectRoot, serverPort, args } = config;

    // Apply React runtime patching
    this.patcher.patch(projectRoot);

    const mergedConfig = loadMergedConfig(projectRoot);
    const timeoutSec = mergedConfig.webAppDevServerTimeout ?? 120;
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

    // Set NODE_OPTIONS to preload our bootstrap script in all Node processes spawned by the dev server
    // Since this file is in src/launcher, __dirname is packages/cli/dist/launcher
    // We resolve bootstrap.js relative to it (which is in packages/cli/dist/bootstrap.js)
    const bootstrapPath = path.resolve(projectRoot, "node_modules/@hoversource/cli/dist/bootstrap.js");
    const bootstrapUrl = pathToFileURL(fs.existsSync(bootstrapPath) ? bootstrapPath : path.resolve(projectRoot, "../cli/dist/bootstrap.js")).href;
    
    const env = { ...process.env };
    const currentOptions = env.NODE_OPTIONS || "";
    env.NODE_OPTIONS = `${currentOptions} --import "${bootstrapUrl}"`.trim();

    // Spawn the dev server
    const { command, args: cmdArgs } = parseCommand(execCommand);
    const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn([resolvedCmd, ...cmdArgs].join(" "), {
          shell: true,
          env,
          cwd: validateSafePath(projectRoot),
          stdio: "inherit",
        })
      : spawn(resolvedCmd, cmdArgs, {
          shell: false,
          env,
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
        return;
      }
      console.error(`[HoverSource] Dev server did not respond on port ${devPort} within timeout.`);
      console.error(`[HoverSource] If your dev server uses a different port, run it separately and use:`);
      console.error(`\x1b[36m[HoverSource]   hs -t http://localhost:<your-port>\x1b[0m`);
      return;
    }

    console.log(`[HoverSource] Dev server is ready on port ${devPort}.`);
    
    // Register cleanup to restore runtimes on exit
    const cleanup = () => {
      this.patcher.restore();
      if (child.pid) {
        try {
          if (process.platform === "win32") {
            spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)]);
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {
          child.kill();
        }
      }
      process.exit();
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    child.on("exit", cleanup);

    await runProxyMode(`http://localhost:${devPort}`, serverPort, args);
  }
}

import fs from "node:fs";
