import fs from "node:fs";
import http from "node:http";
import {
  bindRepoPreset,
  buildDeltaFromKeyValue,
  ConfigValidationError,
  deleteConfigTarget,
  deletePreset,
  getConfigForTarget,
  getConfigValueByPath,
  getGlobalConfigPath,
  getLocalConfigPath,
  listPresets,
  loadMergedConfig,
  resetConfigTarget,
  saveConfigDelta,
  savePreset,
  usePreset,
  validatePresetName,
  type HoverSourceConfig,
} from "@hoversource/companion-server/config";
import { askQuestion } from "../port.js";

export interface ConfigCommandOptions {
  positionals: string[];
  args: Record<string, string | boolean>;
  projectRoot: string;
  requestedPort: number;
  globalConfigPath?: string;
  stdinIsTTY?: boolean;
  askQuestionFn?: (query: string) => Promise<string>;
  reloadTimeoutMs?: number;
}

type ConfigScope = "global" | "local" | "merged";

function writeStdoutJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function httpRequest(
  method: "GET" | "POST",
  url: string,
  timeoutMs: number
): Promise<{ statusCode: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.request(url, { method, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });

    req.end();
  });
}

export async function notifyCompanionReload(
  port: number,
  timeoutMs = 800
): Promise<boolean> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const ping = await httpRequest("GET", `${baseUrl}/ping`, timeoutMs);
  if (!ping || ping.statusCode !== 200 || ping.body.trim() !== "pong") {
    return false;
  }

  const reload = await httpRequest("POST", `${baseUrl}/reload-config`, timeoutMs);
  return Boolean(reload && reload.statusCode >= 200 && reload.statusCode < 400);
}

function readConfigForScope(
  scope: ConfigScope,
  projectRoot: string,
  globalConfigPath?: string
): HoverSourceConfig {
  if (scope === "merged") {
    return loadMergedConfig(projectRoot, globalConfigPath);
  }
  return getConfigForTarget(scope, null, projectRoot, globalConfigPath);
}

function resolveScopeMeta(
  scope: ConfigScope,
  projectRoot: string,
  globalConfigPath?: string
): { path: string; exists: boolean } {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const localPath = getLocalConfigPath(projectRoot);
  if (scope === "global") {
    return { path: globalPath, exists: fs.existsSync(globalPath) };
  }
  if (scope === "local") {
    return { path: localPath, exists: fs.existsSync(localPath) };
  }
  const localExists = fs.existsSync(localPath);
  const globalExists = fs.existsSync(globalPath);
  return {
    path: localExists ? localPath : globalPath,
    exists: localExists || globalExists,
  };
}

async function confirmDestructiveAction(
  prompt: string,
  opts: ConfigCommandOptions
): Promise<{ confirmed: boolean; nonInteractiveRejected: boolean }> {
  const isYes = Boolean(opts.args.yes || opts.args.y);
  if (isYes) {
    return { confirmed: true, nonInteractiveRejected: false };
  }

  const stdinIsTTY = opts.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  const isInteractive = stdinIsTTY && process.env.CI !== "true";
  if (!isInteractive) {
    return { confirmed: false, nonInteractiveRejected: true };
  }

  const askFn = opts.askQuestionFn ?? askQuestion;
  const answer = await askFn(prompt);
  return {
    confirmed: answer.trim().toLowerCase() === "y",
    nonInteractiveRejected: false,
  };
}

function tryValidatePresetName(rawName: string): string | null {
  try {
    return validatePresetName(rawName);
  } catch (err) {
    const message = err instanceof ConfigValidationError ? err.message : String(err);
    console.error(`[HoverSource] ${message}`);
    return null;
  }
}

async function handlePresetCommand(
  opts: ConfigCommandOptions,
  isJson: boolean,
  isDryRun: boolean
): Promise<number> {
  const presetAction = opts.positionals[2] ?? "list";
  const globalPath = getGlobalConfigPath(opts.globalConfigPath);

  if (presetAction === "list") {
    const result = listPresets(opts.projectRoot, opts.globalConfigPath);
    if (isJson) {
      writeStdoutJson({ path: globalPath, ...result });
    } else {
      const names = Object.keys(result.presets);
      console.log(`[HoverSource] Presets (${globalPath}):`);
      if (names.length === 0) {
        console.log("  (none)");
      } else {
        for (const name of names) {
          const markers: string[] = [];
          if (name === result.activePreset) markers.push("active");
          if (name === result.boundPreset) markers.push("bound");
          const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
          console.log(`  - ${name}${suffix}`);
        }
      }
    }
    return 0;
  }

  if (presetAction === "save") {
    const rawName = opts.positionals[3];
    if (rawName === undefined) {
      console.error("[HoverSource] Usage: hs config preset save <name>");
      return 2;
    }
    const name = tryValidatePresetName(rawName);
    if (!name) return 2;

    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({ dryRun: true, action: "save", name, path: globalPath });
      } else {
        console.log(`[HoverSource] Dry run: would save preset "${name}" to ${globalPath}`);
      }
      return 0;
    }

    const result = savePreset(name, null, opts.projectRoot, opts.globalConfigPath);
    const reloaded = await notifyCompanionReload(opts.requestedPort, opts.reloadTimeoutMs);
    if (isJson) {
      writeStdoutJson({
        action: "save",
        name: result.name,
        path: result.savedTo,
        preset: result.preset,
        reloaded,
      });
    } else {
      console.log(
        `[HoverSource] Saved preset "${result.name}" to ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`
      );
    }
    return 0;
  }

  if (presetAction === "use") {
    const rawName = opts.positionals[3];
    if (rawName === undefined) {
      console.error("[HoverSource] Usage: hs config preset use <name>");
      return 2;
    }
    const name = tryValidatePresetName(rawName);
    if (!name) return 2;

    const { presets } = listPresets(opts.projectRoot, opts.globalConfigPath);
    if (!Object.prototype.hasOwnProperty.call(presets, name)) {
      console.error(`[HoverSource] Unknown preset "${name}".`);
      return 2;
    }

    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({ dryRun: true, action: "use", name, path: globalPath });
      } else {
        console.log(`[HoverSource] Dry run: would activate preset "${name}" in ${globalPath}`);
      }
      return 0;
    }

    const result = usePreset(name, opts.projectRoot, opts.globalConfigPath);
    const reloaded = await notifyCompanionReload(opts.requestedPort, opts.reloadTimeoutMs);
    if (isJson) {
      writeStdoutJson({
        action: "use",
        activePreset: result.activePreset,
        path: result.savedTo,
        reloaded,
      });
    } else {
      console.log(
        `[HoverSource] Activated preset "${result.activePreset}" in ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`
      );
    }
    return 0;
  }

  if (presetAction === "delete") {
    const rawName = opts.positionals[3];
    if (rawName === undefined) {
      console.error("[HoverSource] Usage: hs config preset delete <name>");
      return 2;
    }
    const name = tryValidatePresetName(rawName);
    if (!name) return 2;

    if (isDryRun) {
      const { presets } = listPresets(opts.projectRoot, opts.globalConfigPath);
      const exists = Object.prototype.hasOwnProperty.call(presets, name);
      if (isJson) {
        writeStdoutJson({ dryRun: true, action: "delete", name, exists, path: globalPath });
      } else {
        console.log(`[HoverSource] Dry run: would delete preset "${name}" from ${globalPath}`);
      }
      return 0;
    }

    const result = deletePreset(name, opts.projectRoot, opts.globalConfigPath);
    const reloaded = result.deleted
      ? await notifyCompanionReload(opts.requestedPort, opts.reloadTimeoutMs)
      : false;
    if (isJson) {
      writeStdoutJson({
        action: "delete",
        name: result.name,
        deleted: result.deleted,
        clearedActive: result.clearedActive,
        path: result.savedTo,
        reloaded,
      });
    } else {
      const msg = result.deleted
        ? `Deleted preset "${result.name}"`
        : `Preset "${result.name}" not found`;
      console.log(`[HoverSource] ${msg} in ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`);
    }
    return 0;
  }

  if (presetAction === "bind") {
    const isClear = Boolean(opts.args.clear);
    const rawName = opts.positionals[3];
    if ((isClear && rawName !== undefined) || (!isClear && rawName === undefined)) {
      console.error("[HoverSource] Usage: hs config preset bind <name|--clear>");
      return 2;
    }

    let name: string | null = null;
    if (!isClear) {
      name = tryValidatePresetName(rawName);
      if (!name) return 2;
    }

    const localPath = getLocalConfigPath(opts.projectRoot);
    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({ dryRun: true, action: "bind", preset: name, clear: isClear, path: localPath });
      } else {
        const desc = isClear ? "clear preset binding" : `bind repo to preset "${name}"`;
        console.log(`[HoverSource] Dry run: would ${desc} at ${localPath}`);
      }
      return 0;
    }

    const result = bindRepoPreset(name, opts.projectRoot, opts.globalConfigPath);
    const reloaded = await notifyCompanionReload(opts.requestedPort, opts.reloadTimeoutMs);
    if (isJson) {
      writeStdoutJson({
        action: "bind",
        boundPreset: result.boundPreset,
        clear: isClear,
        path: result.savedTo,
        reloaded,
      });
    } else {
      const desc = isClear
        ? "Cleared preset binding"
        : `Bound repo to preset "${result.boundPreset}"`;
      console.log(`[HoverSource] ${desc} at ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`);
    }
    return 0;
  }

  console.error(
    `[HoverSource] Unknown preset action "${presetAction}". Usage: hs config preset <list|save|use|delete|bind> [options]`
  );
  return 2;
}

export async function runConfigCommand(opts: ConfigCommandOptions): Promise<number> {
  const hasGlobal = Boolean(opts.args.global);
  const hasLocal = Boolean(opts.args.local);
  const hasMerged = Boolean(opts.args.merged);

  if (hasGlobal && hasLocal) {
    console.error(
      "[HoverSource] Conflicting scope flags: --global and --local cannot be used together."
    );
    return 2;
  }

  const action = opts.positionals[1] ?? "list";
  const isJson = Boolean(opts.args.json);
  const isDryRun = Boolean(opts.args["dry-run"]);
  const presetSubAction = action === "preset" ? (opts.positionals[2] ?? "list") : undefined;
  const isReadAction =
    action === "list" ||
    action === "show" ||
    action === "get" ||
    (action === "preset" && presetSubAction === "list");

  if (!isReadAction && hasMerged) {
    console.error(
      `[HoverSource] --merged is read-only and cannot be used with "${action}".`
    );
    return 2;
  }

  if (action === "preset") {
    return handlePresetCommand(opts, isJson, isDryRun);
  }

  const scope: ConfigScope = hasGlobal
    ? "global"
    : hasLocal
      ? "local"
      : isReadAction
        ? "merged"
        : "local";

  if (action === "list" || action === "show") {
    const config = readConfigForScope(scope, opts.projectRoot, opts.globalConfigPath);
    const meta = resolveScopeMeta(scope, opts.projectRoot, opts.globalConfigPath);
    if (isJson) {
      writeStdoutJson({
        target: scope,
        path: meta.path,
        exists: meta.exists,
        config,
      });
    } else {
      console.log(
        `[HoverSource] Config (${scope}) [${meta.path}] (exists: ${meta.exists}):`
      );
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    }
    return 0;
  }

  if (action === "get") {
    const keyPath = opts.positionals[2];
    if (!keyPath) {
      console.error("[HoverSource] Usage: hs config get <keyPath>");
      return 2;
    }

    const config = readConfigForScope(scope, opts.projectRoot, opts.globalConfigPath);
    const value = getConfigValueByPath(config, keyPath);
    if (value === undefined) {
      console.error(`[HoverSource] Unknown config key path: "${keyPath}".`);
      return 2;
    }

    if (isJson) {
      writeStdoutJson({ key: keyPath, value, target: scope });
    } else {
      const formatted =
        typeof value === "object" && value !== null
          ? JSON.stringify(value, null, 2)
          : String(value);
      process.stdout.write(`${formatted}\n`);
    }
    return 0;
  }

  if (action === "set") {
    const keyPath = opts.positionals[2];
    const rawValue = opts.positionals[3];
    if (!keyPath || rawValue === undefined) {
      console.error("[HoverSource] Usage: hs config set <keyPath> <value>");
      return 2;
    }

    const parsed = buildDeltaFromKeyValue(keyPath, rawValue);
    if (!parsed.ok) {
      console.error(
        `[HoverSource] Invalid value for "${keyPath}": ${parsed.error}`
      );
      return 2;
    }

    const writeTarget = scope === "global" ? "global" : "local";
    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({
          dryRun: true,
          target: writeTarget,
          key: keyPath,
          delta: parsed.value,
        });
      } else {
        console.log(
          `[HoverSource] Dry run (${writeTarget}): would apply ${JSON.stringify(parsed.value)}`
        );
      }
      return 0;
    }

    const result = saveConfigDelta(
      parsed.value,
      writeTarget,
      opts.projectRoot,
      null,
      opts.globalConfigPath
    );
    const reloaded = await notifyCompanionReload(
      opts.requestedPort,
      opts.reloadTimeoutMs
    );
    const updatedValue = getConfigValueByPath(result.config, keyPath) ?? null;

    if (isJson) {
      writeStdoutJson({
        target: writeTarget,
        path: result.savedTo,
        key: keyPath,
        value: updatedValue,
        reloaded,
      });
    } else {
      console.log(
        `[HoverSource] Updated ${keyPath} in ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`
      );
    }
    return 0;
  }

  if (action === "reset") {
    const writeTarget = scope === "global" ? "global" : "local";
    const targetPath =
      writeTarget === "global"
        ? getGlobalConfigPath(opts.globalConfigPath)
        : getLocalConfigPath(opts.projectRoot);

    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({ dryRun: true, target: writeTarget, path: targetPath });
      } else {
        console.log(
          `[HoverSource] Dry run: would reset ${writeTarget} config at ${targetPath}`
        );
      }
      return 0;
    }

    const { confirmed, nonInteractiveRejected } = await confirmDestructiveAction(
      `Reset ${writeTarget} config at ${targetPath}? (y/N): `,
      opts
    );
    if (nonInteractiveRejected) {
      console.error(
        "[HoverSource] Refusing to reset config in non-interactive mode. Pass --yes (-y) to confirm."
      );
      return 2;
    }
    if (!confirmed) {
      if (isJson) {
        writeStdoutJson({ cancelled: true, target: writeTarget, path: targetPath });
      } else {
        console.log("[HoverSource] Reset cancelled.");
      }
      return 0;
    }

    const result = resetConfigTarget(
      writeTarget,
      opts.projectRoot,
      null,
      opts.globalConfigPath
    );
    const reloaded = await notifyCompanionReload(
      opts.requestedPort,
      opts.reloadTimeoutMs
    );

    if (isJson) {
      writeStdoutJson({
        target: writeTarget,
        path: result.savedTo,
        reset: true,
        reloaded,
      });
    } else {
      console.log(
        `[HoverSource] Reset ${writeTarget} config at ${result.savedTo}${reloaded ? " (companion reloaded)" : ""}`
      );
    }
    return 0;
  }

  if (action === "delete") {
    if (scope === "global") {
      console.error(
        "[HoverSource] Deleting global config is not permitted. Use 'hs config reset --global' instead."
      );
      return 2;
    }

    const targetPath = getLocalConfigPath(opts.projectRoot);
    if (isDryRun) {
      if (isJson) {
        writeStdoutJson({
          dryRun: true,
          target: "local",
          path: targetPath,
          exists: fs.existsSync(targetPath),
        });
      } else {
        console.log(
          `[HoverSource] Dry run: would delete local config at ${targetPath}`
        );
      }
      return 0;
    }

    const { confirmed, nonInteractiveRejected } = await confirmDestructiveAction(
      `Delete local config at ${targetPath}? (y/N): `,
      opts
    );
    if (nonInteractiveRejected) {
      console.error(
        "[HoverSource] Refusing to delete config in non-interactive mode. Pass --yes (-y) to confirm."
      );
      return 2;
    }
    if (!confirmed) {
      if (isJson) {
        writeStdoutJson({ cancelled: true, target: "local", path: targetPath });
      } else {
        console.log("[HoverSource] Delete cancelled.");
      }
      return 0;
    }

    const result = deleteConfigTarget(
      "local",
      opts.projectRoot,
      null,
      false,
      opts.globalConfigPath
    );
    const reloaded = await notifyCompanionReload(
      opts.requestedPort,
      opts.reloadTimeoutMs
    );

    if (isJson) {
      writeStdoutJson({
        target: "local",
        path: targetPath,
        deleted: result.deletedFile,
        reloaded,
      });
    } else {
      console.log(
        `[HoverSource] ${result.deletedFile ? "Deleted" : "No file at"} ${targetPath}${reloaded ? " (companion reloaded)" : ""}`
      );
    }
    return 0;
  }

  console.error(
    `[HoverSource] Unknown config action "${action}". Usage: hs config <list|show|get|set|reset|delete|preset> [options]`
  );
  return 2;
}
