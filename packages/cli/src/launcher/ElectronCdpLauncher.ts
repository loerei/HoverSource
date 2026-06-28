import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { AppLauncher, LaunchConfig } from "./types.js";
import {
  parseCommand,
  resolveWindowsCommand,
  validateSafeCommand,
  validateSafePath,
  findScriptPath,
  startCdpInjectionWatch,
  resolveDebugPortConflicts
} from "../cli.js";

export class ElectronCdpLauncher implements AppLauncher {
  async launch(config: LaunchConfig): Promise<void> {
    const { execCommand, projectRoot, serverPort, debugPort, args } = config;

    const { command, args: cmdArgs } = parseCommand(execCommand);
    const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));

    const runWithCdp = (portToUse: number, patchRestorer?: () => void) => {
      const electronArgs = [...cmdArgs, `--remote-debugging-port=${portToUse}`];
      console.log(`[HoverSource] Launching target command with remote debugging: ${[resolvedCmd, ...electronArgs].join(" ")}`);
      
      const env = {
        ...process.env,
        ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${portToUse}`
      };

      const useShell = process.platform === "win32";
      const child = useShell
        ? spawn([resolvedCmd, ...electronArgs].join(" "), {
            shell: true,
            env,
            cwd: validateSafePath(projectRoot),
            stdio: "inherit",
          })
        : spawn(resolvedCmd, electronArgs, {
            shell: false,
            env,
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

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      child.on("exit", cleanup);
    };

    const autoResolve = args["auto-resolve"] === true;
    resolveDebugPortConflicts(debugPort, projectRoot, autoResolve, args).then((resolved) => {
      runWithCdp(resolved.resolvedDebugPort, resolved.patchRestorer);
    });
  }
}
