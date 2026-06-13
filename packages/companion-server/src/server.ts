import http from "node:http";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { broadcastToTargets } from "@hoversource/client-injector";
import { StaticContextResolver } from "./staticResolver.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ShortcutKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface HoverSourceConfig {
  theme: "dark" | "light" | "system";
  minimalModeByDefault: boolean;
  editor: string;
  autoResolvePortConflicts?: boolean;
  snappingThreshold?: number;
  desnappingThreshold?: number;
  shortcuts: {
    toggleUI: ShortcutKey;
    toggleMinimal: ShortcutKey;
    toggleFreeze: ShortcutKey;
    copyMetadata: ShortcutKey;
    copyAllLayers: ShortcutKey;
    openDashboard: ShortcutKey;
    toggleMode: ShortcutKey;
  };
}

export interface ServerConfig {
  port: number;
  projectRoot: string;
  debugPort: number;
}

// Default Hardcoded Configurations
const DEFAULT_CONFIG: HoverSourceConfig = {
  theme: "dark",
  minimalModeByDefault: false,
  editor: "vscode",
  autoResolvePortConflicts: false,
  snappingThreshold: 15,
  desnappingThreshold: 15,
  shortcuts: {
    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false },
    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false },
    toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false },
    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false },
    copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true },
    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false },
    toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false }
  }
};

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".hoversourcerc");
}

function getLocalConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".hoversourcerc");
}

// Helper to normalize project path casing (Windows drive letters) and separators
export function normalizeProjectPath(projectPath: string): string {
  let resolved = path.resolve(projectPath).replaceAll("\\", "/");
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved[0].toUpperCase() + resolved.slice(1);
  }
  return resolved;
}

// Helper to record recent projects
function registerRecentProject(projectRoot: string) {
  const globalPath = getGlobalConfigPath();
  let globalData: any = {};
  
  if (fs.existsSync(globalPath)) {
    try {
      globalData = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
    } catch {}
  }
  
  if (!globalData.recentProjects) {
    globalData.recentProjects = [];
  }
  
  const normalized = normalizeProjectPath(projectRoot);
  
  // Clean up and deduplicate existing recentProjects
  const cleaned: string[] = [];
  for (const p of globalData.recentProjects) {
    const norm = normalizeProjectPath(p);
    if (!cleaned.includes(norm)) {
      cleaned.push(norm);
    }
  }
  
  if (!cleaned.includes(normalized)) {
    cleaned.push(normalized);
    if (cleaned.length > 10) {
      cleaned.shift();
    }
  }
  
  globalData.recentProjects = cleaned;
  
  try {
    fs.writeFileSync(globalPath, JSON.stringify(globalData, null, 2), "utf-8");
  } catch (e) {
    console.warn(`[HoverSource] Failed to save project history to global config`, e);
  }
}

function getRecentProjects(): string[] {
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    try {
      const globalData = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      const list = globalData.recentProjects || [];
      const cleaned: string[] = [];
      for (const p of list) {
        const norm = normalizeProjectPath(p);
        if (!cleaned.includes(norm)) {
          cleaned.push(norm);
        }
      }
      return cleaned;
    } catch {}
  }
  return [];
}

// Load and merge config hierarchies
export function loadMergedConfig(projectRoot: string): HoverSourceConfig {
  let config = { ...DEFAULT_CONFIG };

  // 1. Read Global Config
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      // Strip recentProjects from configuration merge
      if (globalConfig.recentProjects) {
        delete globalConfig.recentProjects;
      }
      config = mergeDeep(config, globalConfig);
    } catch (e) {
      console.warn(`[HoverSource] Failed to parse global config at ${globalPath}`, e);
    }
  }

  // 2. Read Local Config
  const localPath = getLocalConfigPath(projectRoot);
  if (fs.existsSync(localPath)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      config = mergeDeep(config, localConfig);
    } catch (e) {
      console.warn(`[HoverSource] Failed to parse local config at ${localPath}`, e);
    }
  }

  return config;
}

// Escape special regex characters to prevent ReDoS
function escapeRegExp(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Resolve a file param (possibly relative) to an absolute path
function resolveFilePath(fileParam: string, projectRoot: string): string {
  if (path.isAbsolute(fileParam)) return fileParam;
  const cleanFile = fileParam.startsWith("/") ? fileParam.substring(1) : fileParam;
  return path.resolve(projectRoot, cleanFile);
}

// Simple deep helper
function mergeDeep(target: any, source: any): any {
  if (typeof target !== "object" || target === null || typeof source !== "object" || source === null) {
    return source;
  }
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in target) {
      result[key] = mergeDeep(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function checkCurrentLine(
  lines: string[],
  targetLineIndex: number,
  tagName?: string,
  classes?: string[]
): boolean {
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return false;
  }
  const targetLine = lines[targetLineIndex];
  let matchesTag = false;
  let matchesClass = false;

  if (tagName) {
    const tagRegex = new RegExp(String.raw`<${escapeRegExp(tagName)}\b|${escapeRegExp(tagName)}`, "i");
    matchesTag = tagRegex.test(targetLine);
  }
  
  if (classes && classes.length > 0) {
    matchesClass = classes.some((cls) => cls.trim() && targetLine.includes(cls));
  }

  return matchesTag || matchesClass;
}

function searchLineByClasses(lines: string[], classes: string[]): { line: number; column: number } | null {
  for (const cls of classes) {
    const cleanCls = cls.trim();
    if (!cleanCls) continue;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(cleanCls)) {
        const colIndex = lines[i].indexOf(cleanCls) + 1;
        return { line: i + 1, column: colIndex };
      }
    }
  }
  return null;
}

function searchLineByTag(
  lines: string[],
  targetLineIndex: number,
  tagName: string
): { line: number; column: number } | null {
  const tagPattern = String.raw`<${escapeRegExp(tagName)}\b`;
  const tagRegex = new RegExp(tagPattern, "i");
  
  let bestLine = -1;
  let minDistance = Infinity;

  for (let i = 0; i < lines.length; i++) {
    if (tagRegex.test(lines[i])) {
      const distance = Math.abs(i - targetLineIndex);
      if (distance < minDistance) {
        minDistance = distance;
        bestLine = i + 1;
      }
    }
  }

  if (bestLine !== -1) {
    const colIndex = lines[bestLine - 1].toLowerCase().indexOf(`<${tagName.toLowerCase()}`) + 1;
    return { line: bestLine, column: colIndex || 1 };
  }
  return null;
}

function verifyAndCorrectSourceLocation(
  filePath: string,
  line: number,
  col: number,
  tagName?: string,
  classes?: string[]
): { line: number; column: number } {
  if (!fs.existsSync(filePath)) {
    return { line, column: col };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    
    // 1. Validate if the line is already correct.
    const targetLineIndex = line - 1;
    if (checkCurrentLine(lines, targetLineIndex, tagName, classes)) {
      return { line, column: col };
    }

    // 2. Correct the line (fallback lookup)
    // First, try searching for the class names since classes are highly specific.
    if (classes && classes.length > 0) {
      const classMatch = searchLineByClasses(lines, classes);
      if (classMatch) return classMatch;
    }

    // Second, if no class matched, search for the tagName.
    if (tagName) {
      const tagMatch = searchLineByTag(lines, targetLineIndex, tagName);
      if (tagMatch) return tagMatch;
    }

  } catch (e) {
    console.warn(`[HoverSource] Failed to verify and correct source line for ${filePath}`, e);
  }

  return { line, column: col };
}

function handlePing(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("pong");
}

function handleShutdown(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  console.log("[HoverSource] Received shutdown request from new instance. Exiting.");
  setTimeout(() => process.exit(0), 100);
}

function handleOverlayScript(req: http.IncomingMessage, res: http.ServerResponse, config: ServerConfig) {
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
  const portBootstrap = `window.__HOVERSOURCE_PORT__ = ${config.port};\n`;
  res.writeHead(200, { "Content-Type": "application/javascript" });
  res.end(portBootstrap + bundleContent);
}

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

function readConfigFromFile(filePath: string): any {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.warn(`[HoverSource] Failed to parse config file at ${filePath}:`, e);
    }
  }
  return null;
}

function getConfigForTarget(queryTarget: string | null, customPath: string | null, defaultRoot: string): HoverSourceConfig {
  let targetConfig = { ...DEFAULT_CONFIG };
  if (queryTarget === "global") {
    const globalPath = getGlobalConfigPath();
    const raw = readConfigFromFile(globalPath);
    if (raw) {
      if (raw.recentProjects) delete raw.recentProjects;
      targetConfig = mergeDeep(targetConfig, raw);
    }
  } else if (queryTarget === "local") {
    const localPath = getLocalConfigPath(defaultRoot);
    const raw = readConfigFromFile(localPath);
    if (raw) {
      targetConfig = mergeDeep(targetConfig, raw);
    }
  } else if (queryTarget === "custom" && customPath) {
    const customPathConfig = getLocalConfigPath(customPath);
    const raw = readConfigFromFile(customPathConfig);
    if (raw) {
      targetConfig = mergeDeep(targetConfig, raw);
    }
  } else {
    targetConfig = loadMergedConfig(defaultRoot);
  }
  return targetConfig;
}

function handleConfigGet(req: http.IncomingMessage, res: http.ServerResponse, url: URL, config: ServerConfig) {
  registerRecentProject(config.projectRoot);
  const queryTarget = url.searchParams.get("target");
  const customPath = url.searchParams.get("customPath");
  
  const targetConfig = getConfigForTarget(queryTarget, customPath, config.projectRoot);

  let configExists = false;
  let targetPath = "";
  if (queryTarget === "local") {
    targetPath = getLocalConfigPath(config.projectRoot);
  } else if (queryTarget === "custom" && customPath) {
    targetPath = getLocalConfigPath(customPath);
  } else if (queryTarget === "global") {
    targetPath = getGlobalConfigPath();
  }
  if (targetPath) {
    configExists = fs.existsSync(targetPath);
  }
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    config: targetConfig,
    currentProject: normalizeProjectPath(config.projectRoot),
    recentProjects: getRecentProjects(),
    configExists
  }));
}

function handleConfigPost(req: http.IncomingMessage, res: http.ServerResponse, config: ServerConfig) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const { config: newConfig, target, customPath } = payload;
      
      if (!newConfig || !target) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing config or target in payload" }));
        return;
      }

      let targetPath = "";
      if (target === "global") {
        targetPath = getGlobalConfigPath();
        // Preserve recentProjects key in global config if it existed
        const existingGlobal = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, "utf-8")) : {};
        if (existingGlobal.recentProjects) {
          newConfig.recentProjects = existingGlobal.recentProjects;
        }
      } else if (target === "local") {
        targetPath = getLocalConfigPath(config.projectRoot);
      } else if (target === "custom" && customPath) {
        targetPath = getLocalConfigPath(customPath);
        registerRecentProject(customPath);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid target or missing customPath" }));
        return;
      }

      fs.writeFileSync(targetPath, JSON.stringify(newConfig, null, 2), "utf-8");
      console.log(`[HoverSource] Configuration saved to: ${targetPath}`);

      // Broadcast configuration hot-reload trigger to active app pages
      const hotReloadScript = `window.postMessage({ type: "HOVERSOURCE_CONFIG_CHANGED", config: ${JSON.stringify(newConfig)} }, "*");`;
      broadcastToTargets(config.debugPort, hotReloadScript).catch((e) =>
        console.error("[HoverSource] Broadcast failed:", e)
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, savedTo: targetPath }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to save config: ${e.message}` }));
    }
  });
}

function handleConfigDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  config: ServerConfig
) {
  try {
    const target = url.searchParams.get("target");
    const customPath = url.searchParams.get("customPath");
    const removeRecent = url.searchParams.get("removeRecent") === "true";

    let targetPath = "";
    if (target === "local") {
      targetPath = getLocalConfigPath(config.projectRoot);
    } else if (target === "custom" && customPath) {
      targetPath = getLocalConfigPath(customPath);
    }

    let deletedFile = false;
    if (targetPath && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      deletedFile = true;
      console.log(`[HoverSource] Configuration deleted at: ${targetPath}`);
    }

    const globalPath = getGlobalConfigPath();
    if (removeRecent || target === "custom") {
      if (fs.existsSync(globalPath)) {
        try {
          const globalData = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
          if (globalData.recentProjects) {
            const pathToRemove = target === "local" ? config.projectRoot : (customPath || "");
            const normalized = normalizeProjectPath(pathToRemove);
            globalData.recentProjects = globalData.recentProjects
              .map((p: string) => normalizeProjectPath(p))
              .filter((p: string) => p !== normalized);
            fs.writeFileSync(globalPath, JSON.stringify(globalData, null, 2), "utf-8");
          }
        } catch (e: any) {
          console.warn(`[HoverSource] Failed to update recent list on config delete`, e);
        }
      }
    }

    // Broadcast configuration hot-reload trigger to active app pages with the new merged config
    const newConfig = loadMergedConfig(config.projectRoot);
    const hotReloadScript = `window.postMessage({ type: "HOVERSOURCE_CONFIG_CHANGED", config: ${JSON.stringify(newConfig)} }, "*");`;
    broadcastToTargets(config.debugPort, hotReloadScript).catch((e) =>
      console.error("[HoverSource] Broadcast failed on delete:", e)
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, deletedFile, removedRecent: removeRecent || target === "custom", newConfig }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Failed to delete config: ${e.message}` }));
  }
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

function handleValidateLine(req: http.IncomingMessage, res: http.ServerResponse, url: URL, config: ServerConfig) {
  const params = parseLocationParams(url, config.projectRoot);
  if (!params) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
    return;
  }

  const { absolutePath, lineVal, colVal, tagNameParam, classList } = params;
  const corrected = verifyAndCorrectSourceLocation(absolutePath, lineVal, colVal, tagNameParam, classList);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    original: { line: lineVal, column: colVal },
    corrected: { line: corrected.line, column: corrected.column }
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

  staticResolver.resolveStaticContext(config.projectRoot, absolutePath, lineVal, colVal, tagNameParam, classList)
    .then(metadata => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metadata));
    })
    .catch(err => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Static context resolution failed: ${err.message}` }));
    });
}

function handleOpenInIde(req: http.IncomingMessage, res: http.ServerResponse, url: URL, config: ServerConfig) {
  const fileParam = url.searchParams.get("file");
  const lineParam = url.searchParams.get("line") || "1";
  const columnParam = url.searchParams.get("column") || "1";
  const tagNameParam = url.searchParams.get("tagName") || undefined;
  const classListParam = url.searchParams.get("classList") || undefined;
  
  const activeConfig = loadMergedConfig(config.projectRoot);
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

export function startCompanionServer(config: ServerConfig): http.Server {
  const staticResolver = new StaticContextResolver();
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

    // Health check
    if (url.pathname === "/ping") {
      handlePing(req, res);
      return;
    }

    // Graceful shutdown
    if (url.pathname === "/shutdown") {
      handleShutdown(req, res);
      return;
    }

    // Serve overlay bundle with companion port embedded
    if (url.pathname === "/hoversource-overlay.js") {
      handleOverlayScript(req, res, config);
      return;
    }

    // Serve Dashboard WebUI
    if (url.pathname === "/dashboard") {
      handleDashboard(req, res);
      return;
    }

    // Open Dashboard in System Browser
    if (url.pathname === "/open-dashboard") {
      handleOpenDashboard(req, res, config);
      return;
    }

    // GET config
    if (url.pathname === "/config" && req.method === "GET") {
      handleConfigGet(req, res, url, config);
      return;
    }

    // POST config
    if (url.pathname === "/config" && req.method === "POST") {
      handleConfigPost(req, res, config);
      return;
    }

    // DELETE config
    if (url.pathname === "/config" && req.method === "DELETE") {
      handleConfigDelete(req, res, url, config);
      return;
    }

    // GET validate-line
    if (url.pathname === "/validate-line" && req.method === "GET") {
      handleValidateLine(req, res, url, config);
      return;
    }

    // GET static-context
    if (url.pathname === "/static-context" && req.method === "GET") {
      handleStaticContext(req, res, url, config, staticResolver);
      return;
    }

    // Open file in Editor/IDE
    if (url.pathname === "/open-in-ide") {
      handleOpenInIde(req, res, url, config);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[HoverSource] Port ${config.port} is already in use.`);
      console.error(`[HoverSource] A previous HoverSource instance may still be running.`);
      console.error(`[HoverSource] Run with a different port, e.g.: --port=3001`);
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
