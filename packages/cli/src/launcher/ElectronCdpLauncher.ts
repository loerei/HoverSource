import fs from "node:fs";
import { spawn } from "node:child_process";
import { closeAllCdpSessions } from "@hoversource/client-injector";
import { AppLauncher, LaunchConfig } from "./types.js";
import { StaticContextResolver, loadMergedConfig } from "@hoversource/companion-server";
import {
  parseCommand,
  resolveWindowsCommand,
  validateSafeCommand,
  validateSafePath,
  findScriptPath,
  startCdpInjectionWatch,
  detectDevServerPort,
} from "../cli.js";
import { resolveDevServerPort } from "../port.js";

export function createElectronCdpCleanup(deps: {
  watchAbort?: AbortController;
  closeSessions?: () => void;
  exit?: (code?: number) => void;
  processEvents?: Pick<NodeJS.EventEmitter, "once" | "removeListener">;
  child?: Pick<NodeJS.EventEmitter, "on" | "removeListener">;
}): () => void {
  const processEvents = deps.processEvents ?? process;
  const exit = deps.exit ?? (() => process.exit());
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    processEvents.removeListener("SIGINT", cleanup);
    processEvents.removeListener("SIGTERM", cleanup);
    deps.child?.removeListener("exit", cleanup);
    deps.watchAbort?.abort();
    deps.closeSessions?.();
    exit();
  };

  processEvents.once("SIGINT", cleanup);
  processEvents.once("SIGTERM", cleanup);
  deps.child?.on("exit", cleanup);

  return cleanup;
}

export class ElectronCdpLauncher implements AppLauncher {
  async launch(config: LaunchConfig): Promise<void> {
    const { execCommand, projectRoot, serverPort, debugPort, args } = config;

    const { command, args: cmdArgs } = parseCommand(execCommand);
    const resolvedCmd = resolveWindowsCommand(validateSafeCommand(command));

    const autoResolve = config.autoResolve ?? (args["auto-resolve"] === true);

    // Check if the dev server port is occupied and resolve it
    const devPort = config.devPort ?? detectDevServerPort(projectRoot, execCommand);
    const devResult = await resolveDevServerPort({
      projectRoot,
      execCommand,
      expectedPort: devPort,
      mode: "electron",
      autoResolve,
      excludePorts: [serverPort, debugPort]
    });

    console.log(`[HoverSource] Launching target command with remote debugging: ${[resolvedCmd, ...cmdArgs].join(" ")}`);

    const env = {
      ...process.env,
      ...devResult.env,
      ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${debugPort}`
    };

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
      console.error(`[HoverSource] Exec command failed to start: ${err.message}`);
    });

    const scriptPath = findScriptPath(projectRoot);
    const scriptContent = fs.readFileSync(validateSafePath(scriptPath), "utf-8");
    const portBootstrap = `globalThis.__HOVERSOURCE_PORT__ = ${serverPort};\n`;
    let htmlBootstrap = "";
    try {
      const staticResolver = new StaticContextResolver();
      const mergedConfig = loadMergedConfig(projectRoot);
      const htmlMap = staticResolver.generateStaticHtmlMap(projectRoot, {
        include: mergedConfig.include,
        ignore: mergedConfig.ignore,
        respectGitignore: mergedConfig.respectGitignore,
      });
      htmlBootstrap = `globalThis.__HOVERSOURCE_STATIC_HTML_MAP__ = ${JSON.stringify(htmlMap)};\n`;
    } catch (err) {
      if (process.env.DEBUG) {
        console.debug("[HoverSource] Ignored static HTML map generation error:", err);
      }
    }
    const scriptWithPort = portBootstrap + htmlBootstrap + scriptContent;

    const watchAbort = new AbortController();
    createElectronCdpCleanup({
      watchAbort,
      closeSessions: closeAllCdpSessions,
      processEvents: process,
      child,
    });

    void startCdpInjectionWatch(debugPort, scriptWithPort, {
      companionPort: serverPort,
      signal: watchAbort.signal,
    });
  }
}
