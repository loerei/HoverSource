import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { AppLauncher, LaunchConfig } from "./types.js";
import { ReactRuntimePatcher } from "../patcher/ReactRuntimePatcher.js";
import { loadMergedConfig } from "@hoversource/companion-server";
import {
  detectDevServerPort,
  parseCommand,
  resolveWindowsCommand,
  validateSafeCommand,
  validateSafePath,
  waitForServer,
  runProxyMode
} from "../cli.js";
import { resolveDevServerPort } from "../port.js";

export class WebProxyLauncher implements AppLauncher {
  private patcher = new ReactRuntimePatcher();

  async launch(config: LaunchConfig): Promise<void> {
    const { execCommand, projectRoot, serverPort, args } = config;

    // Apply React runtime patching
    this.patcher.patch(projectRoot);

    const mergedConfig = loadMergedConfig(projectRoot);
    const timeoutSec = mergedConfig.webAppDevServerTimeout ?? 120;
    const timeoutMs = timeoutSec * 1000;

    const expectedDevPort = detectDevServerPort(projectRoot, execCommand);
    console.log(`[HoverSource] Web app detected. Dev server expected on port ${expectedDevPort}.`);

    const autoResolve = args["auto-resolve"] === true;
    const devResult = await resolveDevServerPort({
      projectRoot,
      execCommand,
      expectedPort: expectedDevPort,
      mode: "web",
      autoResolve,
      excludePorts: [serverPort]
    });

    const targetDevPort = devResult.port;
    if (targetDevPort !== expectedDevPort) {
      console.log(`[HoverSource] Dev server will use port ${targetDevPort} instead of ${expectedDevPort}.`);
    }

    // Set NODE_OPTIONS to preload our bootstrap script in all Node processes spawned by the dev server
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const localBootstrap = path.resolve(__dirname, "../bootstrap.js");
    const projectBootstrap = path.resolve(projectRoot, "node_modules/@hoversource/cli/dist/bootstrap.js");
    const bootstrapPath = fs.existsSync(projectBootstrap) ? projectBootstrap : localBootstrap;
    const bootstrapUrl = pathToFileURL(bootstrapPath).href;
    
    const env = { ...process.env, ...devResult.env };
    const currentOptions = env.NODE_OPTIONS || "";
    env.NODE_OPTIONS = `${currentOptions} --import "${bootstrapUrl}"`.trim();

    // Spawn the dev server
    const { command, args: cmdArgs } = parseCommand(execCommand);
    const finalArgs = [...cmdArgs, ...devResult.extraArgs];
    const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn([resolvedCmd, ...finalArgs].join(" "), {
          shell: true,
          env,
          cwd: validateSafePath(projectRoot),
          stdio: "inherit",
        })
      : spawn(resolvedCmd, finalArgs, {
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
    console.log(`[HoverSource] Waiting for dev server on port ${targetDevPort} (timeout: ${timeoutSec}s)...`);
    const ready = await waitForServer(targetDevPort, timeoutMs, () => hasExited);

    if (!ready) {
      if (hasExited) {
        console.error(`\n\x1b[31m[HoverSource] Error: Dev server process exited early with code ${exitCode}.\x1b[0m`);
        console.error(`[HoverSource] Please make sure your dev server is built and can run successfully.`);
        console.error(`[HoverSource] If it's a production server, ensure you have built it first (e.g. npm run build)`);
        console.error(`[HoverSource] or run the development server instead (e.g. hs dev).`);
        return;
      }
      console.error(`[HoverSource] Dev server did not respond on port ${targetDevPort} within timeout.`);
      console.error(`[HoverSource] If your dev server uses a different port, run it separately and use:`);
      console.error(`\x1b[36m[HoverSource]   hs -t http://localhost:<your-port>\x1b[0m`);
      return;
    }

    console.log(`[HoverSource] Dev server is ready on port ${targetDevPort}.`);
    
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

    await runProxyMode(`http://localhost:${targetDevPort}`, serverPort, args);
  }
}
