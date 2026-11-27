import http from "node:http";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { broadcastToTargets } from "@hoversource/client-injector";
import { StaticContextResolver, StaticHtmlEntry, StaticScanOptions } from "./staticResolver.js";
export { StaticContextResolver, StaticHtmlEntry, StaticScanOptions } from "./staticResolver.js";
import {
  resolveFilePath,
  validateSourceLocation,
  verifyAndCorrectSourceLocation,
} from "./sourceLocation.js";
import {
  ShortcutKey,
  HoverSourceConfig,
  PresetConfig,
  ConfigTarget,
  ConfigValidationError,
  normalizeProjectPath,
  loadMergedConfig,
  getConfigForTarget,
  getGlobalConfigPath,
  getLocalConfigPath,
  isSameConfigFilePath,
  registerRecentProject,
  getRecentProjects,
  parseConfigDelta,
  saveConfigDelta,
  deleteConfigTarget,
  listPresets,
  savePreset,
  usePreset,
  deletePreset,
  bindRepoPreset,
  listFilterPresets,
  saveFilterPreset,
  useFilterPreset,
  deleteFilterPreset,
  type MetadataFilterPresetPayload,
} from "./configStore.js";
export { ShortcutKey, HoverSourceConfig, CompanionConflictPolicy, PortsConfig, normalizeProjectPath, loadMergedConfig } from "./configStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port: number;
  projectRoot: string;
  debugPort: number;
  globalConfigPath?: string;
}

function getStaticScanOptions(config: ServerConfig): StaticScanOptions {
  const merged = loadMergedConfig(config.projectRoot, config.globalConfigPath);
  return {
    include: merged.include,
    ignore: merged.ignore,
    respectGitignore: merged.respectGitignore,
  };
}


function handlePing(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("pong");
}

function handleStatus(req: http.IncomingMessage, res: http.ServerResponse, config: ServerConfig) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      pid: process.pid,
      port: config.port,
      projectRoot: normalizeProjectPath(config.projectRoot),
      debugPort: config.debugPort,
    })
  );
}

function handleShutdown(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  console.log("[HoverSource] Received shutdown request from new instance. Exiting.");
  setTimeout(() => process.exit(0), 100);
}

function handleOverlayScript(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  staticResolver: StaticContextResolver
) {
  const bundlePathsToTry = [
    path.resolve(__dirname, "../../overlay-core/dist/overlay.bundle.js"),
    path.resolve(__dirname, "../node_modules/@hoversource/overlay-core/dist/overlay.bundle.js"),
  ];
  let bundlePath = "";
  for (const p of bundlePathsToTry) {
    if (fs.existsSync(p)) { bundlePath = p; break; }
  }
  if (!bundlePath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("overlay.bundle.js not found — run npm run build first");
    return;
  }
  const bundleContent = fs.readFileSync(bundlePath, "utf-8");
  let htmlBootstrap = "";
  try {
    const htmlMap = staticResolver.generateStaticHtmlMap(
      config.projectRoot,
      getStaticScanOptions(config)
    );
    htmlBootstrap = `window.__HOVERSOURCE_STATIC_HTML_MAP__ = ${JSON.stringify(htmlMap)};\n`;
  } catch {}
  const portBootstrap = `window.__HOVERSOURCE_PORT__ = ${config.port};\n`;
  res.writeHead(200, {
    "Content-Type": "application/javascript",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  res.end(portBootstrap + htmlBootstrap + bundleContent);
}

// Dashboard router mapping: can serve from packages or local companion static assets
function handleDashboard(req: http.IncomingMessage, res: http.ServerResponse) {
  let dashboardPath = path.resolve(__dirname, "dashboard.html");
  if (!fs.existsSync(dashboardPath)) {
    dashboardPath = path.resolve(__dirname, "../src/dashboard.html");
  }
  if (fs.existsSync(dashboardPath)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fs.readFileSync(dashboardPath));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Dashboard HTML file not found.");
  }
}

function handleOpenDashboard(req: http.IncomingMessage, res: http.ServerResponse, config: ServerConfig) {
  let startCmd = "xdg-open";
  if (process.platform === "darwin") {
    startCmd = "open";
  } else if (process.platform === "win32") {
    startCmd = "start";
  }
  const command = process.platform === "win32" ? `start "" "http://127.0.0.1:${config.port}/dashboard"` : `${startCmd} "http://127.0.0.1:${config.port}/dashboard"`;
  exec(command, (error) => {
    if (error) {
      console.error(`[HoverSource] Failed to open browser dashboard:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to open dashboard: ${error.message}` }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    }
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onParsed: (payload: any) => void,
  allowEmpty = false
): void {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    if (allowEmpty && body.trim() === "") {
      onParsed({});
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }
    onParsed(payload);
  });
}

function handlePresetError(res: http.ServerResponse, err: unknown, actionLabel: string): void {
  if (err instanceof ConfigValidationError) {
    sendJson(res, 400, { error: err.message, issues: err.issues });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  sendJson(res, 500, { error: `Failed to ${actionLabel}: ${message}` });
}

function handleConfigGet(req: http.IncomingMessage, res: http.ServerResponse, url: URL, config: ServerConfig) {
  registerRecentProject(config.projectRoot, config.globalConfigPath);
  const queryTarget = url.searchParams.get("target");
  const customPath = url.searchParams.get("customPath");

  const targetConfig = getConfigForTarget(queryTarget, customPath, config.projectRoot, config.globalConfigPath);

  let configExists = false;
  let targetPath = "";
  if (queryTarget === "local") {
    targetPath = getLocalConfigPath(config.projectRoot);
  } else if (queryTarget === "custom" && customPath) {
    targetPath = getLocalConfigPath(customPath);
  } else if (queryTarget === "global") {
    targetPath = getGlobalConfigPath(config.globalConfigPath);
  }
  if (targetPath) {
    const globalPath = getGlobalConfigPath(config.globalConfigPath);
    const distinctFromGlobal =
      queryTarget === "global" || !isSameConfigFilePath(targetPath, globalPath);
    configExists = distinctFromGlobal && fs.existsSync(targetPath);
  }

  sendJson(res, 200, {
    config: targetConfig,
    currentProject: normalizeProjectPath(config.projectRoot),
    recentProjects: getRecentProjects(config.globalConfigPath),
    configExists
  });
}

function broadcastConfigUpdate(
  debugPort: number,
  mergedConfig: HoverSourceConfig,
  sseClients: Set<http.ServerResponse>,
  errorLabel = "Broadcast failed:"
): void {
  const hotReloadScript = `window.postMessage({ type: "HOVERSOURCE_CONFIG_CHANGED", config: ${JSON.stringify(mergedConfig)} }, "*");`;
  broadcastToTargets(debugPort, hotReloadScript).catch((e) =>
    console.error(`[HoverSource] ${errorLabel}`, e)
  );

  const sseFrame = `event: config\ndata: ${JSON.stringify(mergedConfig)}\n\n`;
  for (const client of sseClients) {
    if (client.writableEnded || client.destroyed) {
      sseClients.delete(client);
      continue;
    }
    try {
      client.write(sseFrame);
    } catch {
      sseClients.delete(client);
    }
  }
}

function handleEvents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sseClients: Set<http.ServerResponse>
) {
  req.socket?.setTimeout?.(0);
  res.setTimeout?.(0);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders?.();

  sseClients.add(res);
  const cleanup = () => {
    sseClients.delete(res);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

function handleConfigPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        return;
      }

      const { config: newConfig, target, customPath } = payload ?? {};

      if (!newConfig || !target) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing config or target in payload" }));
        return;
      }

      if (target !== "global" && target !== "local" && (target !== "custom" || !customPath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid target or missing customPath" }));
        return;
      }

      const parsed = parseConfigDelta(newConfig);
      if (!parsed.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: parsed.error, issues: parsed.issues }));
        return;
      }

      const { savedTo, config: fullyMerged } = saveConfigDelta(
        parsed.value,
        target as ConfigTarget,
        config.projectRoot,
        customPath,
        config.globalConfigPath
      );
      console.log(`[HoverSource] Configuration delta merged and saved to: ${savedTo}`);

      // Broadcast configuration hot-reload trigger to active app pages
      broadcastConfigUpdate(config.debugPort, fullyMerged, sseClients, "Broadcast failed:");

      sendJson(res, 200, { success: true, savedTo, config: fullyMerged });
    } catch (e: any) {
      sendJson(res, 500, { error: `Failed to save config: ${e.message}` });
    }
  });
}

function handleConfigDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  try {
    const target = url.searchParams.get("target");
    const customPath = url.searchParams.get("customPath");
    const removeRecent = url.searchParams.get("removeRecent") === "true";

    let deletedFile = false;
    let newConfig: HoverSourceConfig;

    if (target === "local" || (target === "custom" && customPath)) {
      const result = deleteConfigTarget(
        target,
        config.projectRoot,
        customPath,
        removeRecent,
        config.globalConfigPath
      );
      deletedFile = result.deletedFile;
      newConfig = result.newConfig;
      if (deletedFile) {
        const deletedPath = target === "local"
          ? getLocalConfigPath(config.projectRoot)
          : getLocalConfigPath(customPath!);
        console.log(`[HoverSource] Configuration deleted at: ${deletedPath}`);
      }
    } else {
      newConfig = loadMergedConfig(config.projectRoot, config.globalConfigPath);
    }

    // Broadcast configuration hot-reload trigger to active app pages with the new merged config
    broadcastConfigUpdate(config.debugPort, newConfig, sseClients, "Broadcast failed on delete:");

    sendJson(res, 200, { success: true, deletedFile, removedRecent: removeRecent || target === "custom", newConfig });
  } catch (e: any) {
    sendJson(res, 500, { error: `Failed to delete config: ${e.message}` });
  }
}

function handleReloadConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  try {
    const merged = loadMergedConfig(config.projectRoot, config.globalConfigPath);
    broadcastConfigUpdate(config.debugPort, merged, sseClients, "Broadcast failed on reload:");

    sendJson(res, 200, { success: true, config: merged });
  } catch (e: any) {
    sendJson(res, 500, { error: `Failed to reload config: ${e.message}` });
  }
}

function handlePresetsGet(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig
) {
  try {
    const listed = listPresets(config.projectRoot, config.globalConfigPath);
    sendJson(res, 200, {
      presets: listed.presets,
      activePreset: listed.activePreset,
      repoBinding: listed.boundPreset,
      effectivePreset: listed.effectivePreset,
    });
  } catch (err) {
    handlePresetError(res, err, "list presets");
  }
}

function handlePresetsPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  readJsonBody(req, res, (payload) => {
    try {
      const name = payload?.name;
      const presetData = payload?.config !== undefined ? payload.config : payload?.preset;
      const result = savePreset(
        name,
        presetData as PresetConfig | null | undefined,
        config.projectRoot,
        config.globalConfigPath
      );
      const merged = loadMergedConfig(config.projectRoot, config.globalConfigPath);
      broadcastConfigUpdate(config.debugPort, merged, sseClients, "Broadcast failed on preset save:");

      sendJson(res, 200, {
        success: true,
        name: result.name,
        preset: result.preset,
        presets: result.presets,
        savedTo: result.savedTo,
        config: merged,
      });
    } catch (err) {
      handlePresetError(res, err, "save preset");
    }
  });
}

function handlePresetsUse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  readJsonBody(req, res, (payload) => {
    try {
      const name = payload?.name !== undefined ? payload.name : payload?.preset;
      const result = usePreset(name, config.projectRoot, config.globalConfigPath);
      broadcastConfigUpdate(config.debugPort, result.config, sseClients, "Broadcast failed on preset use:");

      sendJson(res, 200, {
        success: true,
        activePreset: result.activePreset,
        savedTo: result.savedTo,
        config: result.config,
      });
    } catch (err) {
      handlePresetError(res, err, "activate preset");
    }
  });
}

function handlePresetsDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  const executeDelete = (name: unknown) => {
    try {
      const result = deletePreset(name as string, config.projectRoot, config.globalConfigPath);
      if (result.deleted) {
        broadcastConfigUpdate(config.debugPort, result.config, sseClients, "Broadcast failed on preset delete:");
      }
      sendJson(res, 200, {
        success: true,
        deleted: result.deleted,
        name: result.name,
        clearedActive: result.clearedActive,
        savedTo: result.savedTo,
        config: result.config,
      });
    } catch (err) {
      handlePresetError(res, err, "delete preset");
    }
  };

  if (url.searchParams.has("name")) {
    executeDelete(url.searchParams.get("name"));
    return;
  }

  readJsonBody(
    req,
    res,
    (payload) => {
      const name = payload?.name !== undefined ? payload.name : payload?.preset;
      executeDelete(name);
    },
    true
  );
}

function handlePresetsBind(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  readJsonBody(req, res, (payload) => {
    try {
      const name = payload?.name !== undefined ? payload.name : payload?.preset;
      const result = bindRepoPreset(name, config.projectRoot, config.globalConfigPath);
      broadcastConfigUpdate(config.debugPort, result.config, sseClients, "Broadcast failed on preset bind:");

      sendJson(res, 200, {
        success: true,
        boundPreset: result.boundPreset,
        savedTo: result.savedTo,
        config: result.config,
      });
    } catch (err) {
      handlePresetError(res, err, "bind repo preset");
    }
  });
}

function parseFilterPresetScope(rawScope: unknown): "local" | "global" | null {
  if (rawScope === undefined || rawScope === null || rawScope === "") {
    return "local";
  }
  if (rawScope === "local" || rawScope === "global") {
    return rawScope;
  }
  return null;
}

function handleFilterPresetsGet(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig
) {
  try {
    const listed = listFilterPresets(config.projectRoot, config.globalConfigPath);
    sendJson(res, 200, listed);
  } catch (err) {
    handlePresetError(res, err, "list filter presets");
  }
}

function handleFilterPresetsPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  readJsonBody(req, res, (payload) => {
    try {
      const scope = parseFilterPresetScope(payload?.scope ?? payload?.target);
      if (!scope) {
        sendJson(res, 400, { error: 'Invalid scope; expected "local" or "global"' });
        return;
      }
      const name = payload?.name;
      const filtersData = payload?.filters as MetadataFilterPresetPayload | null | undefined;
      const result = saveFilterPreset(
        name,
        filtersData,
        scope,
        config.projectRoot,
        config.globalConfigPath
      );
      const merged = loadMergedConfig(config.projectRoot, config.globalConfigPath);
      broadcastConfigUpdate(config.debugPort, merged, sseClients, "Broadcast failed on filter preset save:");

      sendJson(res, 200, {
        success: true,
        name: result.name,
        scope: result.scope,
        filters: result.filters,
        savedTo: result.savedTo,
        list: result.list,
        config: merged,
      });
    } catch (err) {
      handlePresetError(res, err, "save filter preset");
    }
  });
}

function handleFilterPresetsUse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  readJsonBody(req, res, (payload) => {
    try {
      const scope = parseFilterPresetScope(payload?.target ?? payload?.scope);
      if (!scope) {
        sendJson(res, 400, { error: 'Invalid target; expected "local" or "global"' });
        return;
      }
      const rawName = payload?.name !== undefined ? payload.name : payload?.preset;
      const name = rawName === null ? null : String(rawName ?? "");
      if (name !== null && name.trim().length === 0) {
        sendJson(res, 400, { error: "Missing preset name" });
        return;
      }
      const result = useFilterPreset(
        rawName === null ? null : name,
        scope,
        config.projectRoot,
        config.globalConfigPath
      );
      broadcastConfigUpdate(config.debugPort, result.config, sseClients, "Broadcast failed on filter preset use:");

      sendJson(res, 200, {
        success: true,
        activePreset: result.activePreset,
        scope: result.scope,
        savedTo: result.savedTo,
        list: result.list,
        config: result.config,
      });
    } catch (err) {
      handlePresetError(res, err, "activate filter preset");
    }
  });
}

function handleFilterPresetsDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  sseClients: Set<http.ServerResponse>
) {
  const executeDelete = (name: unknown, rawScope: unknown) => {
    try {
      const scope = parseFilterPresetScope(rawScope);
      if (!scope) {
        sendJson(res, 400, { error: 'Invalid scope; expected "local" or "global"' });
        return;
      }
      const result = deleteFilterPreset(name, scope, config.projectRoot, config.globalConfigPath);
      if (result.deleted) {
        broadcastConfigUpdate(config.debugPort, result.config, sseClients, "Broadcast failed on filter preset delete:");
      }
      sendJson(res, 200, {
        success: true,
        deleted: result.deleted,
        name: result.name,
        scope: result.scope,
        revertedTo: result.revertedTo,
        clearedActive: result.clearedActive,
        savedTo: result.savedTo,
        list: result.list,
        config: result.config,
      });
    } catch (err) {
      handlePresetError(res, err, "delete filter preset");
    }
  };

  if (url.searchParams.has("name")) {
    executeDelete(url.searchParams.get("name"), url.searchParams.get("scope"));
    return;
  }

  readJsonBody(
    req,
    res,
    (payload) => {
      const name = payload?.name !== undefined ? payload.name : payload?.preset;
      const scope = payload?.scope ?? payload?.target;
      executeDelete(name, scope);
    },
    true
  );
}

interface RequestLocationParams {
  fileParam: string;
  lineVal: number;
  colVal: number;
  tagNameParam?: string;
  classList: string[];
  absolutePath: string;
}

function parseLocationParams(url: URL, projectRoot: string): RequestLocationParams | null {
  const fileParam = url.searchParams.get("file");
  if (!fileParam) {
    return null;
  }
  const lineParam = url.searchParams.get("line") || "1";
  const columnParam = url.searchParams.get("column") || "1";
  const tagNameParam = url.searchParams.get("tagName") || undefined;
  const classListParam = url.searchParams.get("classList") || undefined;

  const absolutePath = resolveFilePath(fileParam, projectRoot);
  const lineVal = Number.parseInt(lineParam, 10);
  const colVal = Number.parseInt(columnParam, 10);
  const classList = classListParam ? classListParam.split(",") : [];

  return {
    fileParam,
    lineVal,
    colVal,
    tagNameParam,
    classList,
    absolutePath
  };
}

async function handleValidateLine(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig
): Promise<void> {
  const params = parseLocationParams(url, config.projectRoot);
  if (!params) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
    return;
  }

  const { fileParam, lineVal, colVal, tagNameParam, classList } = params;
  const result = await validateSourceLocation(
    fileParam,
    config.projectRoot,
    lineVal,
    colVal,
    tagNameParam,
    classList
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    original: { line: lineVal, column: colVal },
    corrected: { line: result.line, column: result.column },
    correctedFile: result.correctedFile
  }));
}

function handleStaticContext(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  staticResolver: StaticContextResolver
) {
  const params = parseLocationParams(url, config.projectRoot);
  if (!params) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
    return;
  }

  const { absolutePath, lineVal, colVal, tagNameParam, classList } = params;

  staticResolver.resolveStaticContext(
    config.projectRoot,
    absolutePath,
    lineVal,
    colVal,
    tagNameParam,
    classList,
    getStaticScanOptions(config)
  )
    .then(metadata => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metadata));
    })
    .catch(err => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Static context resolution failed: ${err.message}` }));
    });
}

function handleResolveHtmlElement(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  staticResolver: StaticContextResolver
) {
  const tagName = url.searchParams.get("tagName") || "";
  const id = url.searchParams.get("id") || undefined;
  const classListParam = url.searchParams.get("classList") || "";
  const classList = classListParam ? classListParam.split(",").filter(Boolean) : [];
  
  let attributes: Record<string, string> | undefined = undefined;
  const attrParam = url.searchParams.get("attributes");
  if (attrParam) {
    try {
      attributes = JSON.parse(attrParam);
    } catch {}
  }

  if (!tagName) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'tagName' parameter" }));
    return;
  }

  try {
    const location = staticResolver.resolveStaticHtmlLocation(
      config.projectRoot,
      {
        tagName,
        id,
        classList,
        attributes,
      },
      getStaticScanOptions(config)
    );

    if (location) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, ...location }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Static HTML location not found" }));
    }
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `HTML resolution failed: ${e.message}` }));
  }
}

function handleOpenInIde(req: http.IncomingMessage, res: http.ServerResponse, url: URL, config: ServerConfig) {
  const fileParam = url.searchParams.get("file");
  const lineParam = url.searchParams.get("line") || "1";
  const columnParam = url.searchParams.get("column") || "1";
  const tagNameParam = url.searchParams.get("tagName") || undefined;
  const classListParam = url.searchParams.get("classList") || undefined;
  
  const activeConfig = loadMergedConfig(config.projectRoot, config.globalConfigPath);
  const editor = url.searchParams.get("editor") || activeConfig.editor || "vscode";

  if (!fileParam) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
    return;
  }

  const absolutePath = resolveFilePath(fileParam, config.projectRoot);

  if (!fs.existsSync(absolutePath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `File not found: ${absolutePath}` }));
    return;
  }

  let lineVal = Number.parseInt(lineParam, 10);
  let colVal = Number.parseInt(columnParam, 10);

  if (tagNameParam || classListParam) {
    const classes = classListParam ? classListParam.split(",") : [];
    const corrected = verifyAndCorrectSourceLocation(absolutePath, lineVal, colVal, tagNameParam, classes);
    lineVal = corrected.line;
    colVal = corrected.column;
  }

  let command = "";
  if (editor === "vscode" || editor === "code") {
    command = `code -g "${absolutePath}:${lineVal}:${colVal}"`;
  } else if (editor === "cursor") {
    command = `cursor -g "${absolutePath}:${lineVal}:${colVal}"`;
  } else {
    command = `code -g "${absolutePath}:${lineVal}:${colVal}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`[HoverSource] Failed to execute editor command: ${command}`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to open editor: ${error.message}` }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, opened: absolutePath }));
    }
  });
}

function routeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig,
  staticResolver: StaticContextResolver,
  sseClients: Set<http.ServerResponse>
): void {
  const path = url.pathname;
  const method = req.method;

  if (path === "/ping") {
    handlePing(req, res);
    return;
  }
  if (path === "/status" && method === "GET") {
    handleStatus(req, res, config);
    return;
  }
  if (path === "/events" && method === "GET") {
    handleEvents(req, res, sseClients);
    return;
  }
  if (path === "/shutdown") {
    handleShutdown(req, res);
    return;
  }
  if (path === "/hoversource-overlay.js") {
    handleOverlayScript(req, res, config, staticResolver);
    return;
  }
  if (path === "/dashboard") {
    handleDashboard(req, res);
    return;
  }
  if (path === "/open-dashboard") {
    handleOpenDashboard(req, res, config);
    return;
  }
  if (path === "/config") {
    if (method === "GET") {
      handleConfigGet(req, res, url, config);
    } else if (method === "POST") {
      handleConfigPost(req, res, config, sseClients);
    } else if (method === "DELETE") {
      handleConfigDelete(req, res, url, config, sseClients);
    }
    return;
  }
  if (path === "/reload-config" && method === "POST") {
    handleReloadConfig(req, res, config, sseClients);
    return;
  }
  if (path === "/presets") {
    if (method === "GET") {
      handlePresetsGet(req, res, config);
      return;
    }
    if (method === "POST") {
      handlePresetsPost(req, res, config, sseClients);
      return;
    }
    if (method === "DELETE") {
      handlePresetsDelete(req, res, url, config, sseClients);
      return;
    }
  }
  if (path === "/presets/use" && method === "POST") {
    handlePresetsUse(req, res, config, sseClients);
    return;
  }
  if (path === "/presets/bind" && method === "POST") {
    handlePresetsBind(req, res, config, sseClients);
    return;
  }
  if (path === "/filter-presets") {
    if (method === "GET") {
      handleFilterPresetsGet(req, res, config);
      return;
    }
    if (method === "POST") {
      handleFilterPresetsPost(req, res, config, sseClients);
      return;
    }
    if (method === "DELETE") {
      handleFilterPresetsDelete(req, res, url, config, sseClients);
      return;
    }
  }
  if (path === "/filter-presets/use" && method === "POST") {
    handleFilterPresetsUse(req, res, config, sseClients);
    return;
  }
  if (path === "/validate-line" && method === "GET") {
    handleValidateLine(req, res, url, config).catch((err: any) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Line validation failed: ${err?.message || String(err)}`,
          })
        );
      }
    });
    return;
  }
  if (path === "/resolve-html-element" && method === "GET") {
    handleResolveHtmlElement(req, res, url, config, staticResolver);
    return;
  }
  if (path === "/static-context" && method === "GET") {
    handleStaticContext(req, res, url, config, staticResolver);
    return;
  }
  if (path === "/open-in-ide") {
    handleOpenInIde(req, res, url, config);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

export function startCompanionServer(config: ServerConfig): http.Server {
  const staticResolver = new StaticContextResolver();
  const sseClients = new Set<http.ServerResponse>();
  const closeSseClients = () => {
    for (const client of sseClients) {
      try {
        client.end();
      } catch {}
    }
    sseClients.clear();
  };

  const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || "", `http://localhost:${config.port}`);
    routeRequest(req, res, url, config, staticResolver, sseClients);
  });

  const originalClose = server.close.bind(server);
  server.close = ((cb?: (err?: Error) => void) => {
    closeSseClients();
    return originalClose(cb);
  }) as typeof server.close;

  server.on("close", closeSseClients);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[HoverSource] Port ${config.port} was claimed between resolution and bind (TOCTOU race).`);
      console.error(`[HoverSource] Try again — the CLI will pick the next free port. Or pass --port=<port> explicitly.`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(config.port, "127.0.0.1", () => {
    console.log(`[HoverSource] Companion Server running at http://127.0.0.1:${config.port}`);
    console.log(`[HoverSource] Project Root resolved to: ${config.projectRoot}`);
  });

  return server;
}
