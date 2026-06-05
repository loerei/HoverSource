import http from "node:http";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { broadcastToTargets } from "@hoversource/client-injector";

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
  shortcuts: {
    toggleUI: ShortcutKey;
    toggleMinimal: ShortcutKey;
    toggleFreeze: ShortcutKey;
    copyMetadata: ShortcutKey;
    openDashboard: ShortcutKey;
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
  shortcuts: {
    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false },
    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false },
    toggleFreeze: { key: "z", altKey: true, ctrlKey: false, shiftKey: false },
    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false },
    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false }
  }
};

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".hoversourcerc");
}

function getLocalConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".hoversourcerc");
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
  
  const normalized = path.resolve(projectRoot).replace(/\\/g, "/");
  
  if (!globalData.recentProjects.includes(normalized)) {
    globalData.recentProjects.push(normalized);
    if (globalData.recentProjects.length > 10) {
      globalData.recentProjects.shift();
    }
    try {
      fs.writeFileSync(globalPath, JSON.stringify(globalData, null, 2), "utf-8");
    } catch (e) {
      console.warn(`[HoverSource] Failed to save project history to global config`, e);
    }
  }
}

function getRecentProjects(): string[] {
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    try {
      const globalData = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      return globalData.recentProjects || [];
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
    if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
      const targetLine = lines[targetLineIndex];
      let matchesTag = false;
      let matchesClass = false;

      if (tagName) {
        const tagRegex = new RegExp(`<${tagName}\\b|${tagName}`, "i");
        matchesTag = tagRegex.test(targetLine);
      }
      
      if (classes && classes.length > 0) {
        matchesClass = classes.some((cls) => cls.trim() && targetLine.includes(cls));
      }

      if (matchesTag || matchesClass) {
        return { line, column: col };
      }
    }

    // 2. Correct the line (fallback lookup)
    // First, try searching for the class names since classes are highly specific.
    if (classes && classes.length > 0) {
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
    }

    // Second, if no class matched, search for the tagName.
    if (tagName) {
      const tagPattern = `<${tagName}\\b`;
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
        const colIndex = lines[bestLine - 1].toLowerCase().indexOf(`<${tagName}`) + 1;
        return { line: bestLine, column: colIndex };
      }
    }

  } catch (e) {
    console.warn(`[HoverSource] Failed to verify and correct source line for ${filePath}`, e);
  }

  return { line, column: col };
}

export function startCompanionServer(config: ServerConfig): http.Server {
  const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || "", `http://localhost:${config.port}`);

    // Health check
    if (url.pathname === "/ping") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("pong");
      return;
    }

    // Graceful shutdown (called by a new HS instance taking over)
    if (url.pathname === "/shutdown") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      console.log("[HoverSource] Received shutdown request from new instance. Exiting.");
      setTimeout(() => process.exit(0), 100);
      return;
    }

    // Serve overlay bundle with companion port embedded (for proxy mode injection)
    if (url.pathname === "/hoversource-overlay.js") {
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
      return;
    }

    // Serve Dashboard WebUI
    if (url.pathname === "/dashboard") {
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
      return;
    }

    // Open Dashboard in System Browser
    if (url.pathname === "/open-dashboard") {
      const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
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
      return;
    }

    // GET config
    if (url.pathname === "/config" && req.method === "GET") {
      registerRecentProject(config.projectRoot);
      const queryTarget = url.searchParams.get("target");
      const customPath = url.searchParams.get("customPath");
      
      let targetConfig = { ...DEFAULT_CONFIG };
      
      if (queryTarget === "global") {
        const globalPath = getGlobalConfigPath();
        if (fs.existsSync(globalPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
            if (raw.recentProjects) delete raw.recentProjects;
            targetConfig = mergeDeep(targetConfig, raw);
          } catch {}
        }
      } else if (queryTarget === "local") {
        const localPath = getLocalConfigPath(config.projectRoot);
        if (fs.existsSync(localPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(localPath, "utf-8"));
            targetConfig = mergeDeep(targetConfig, raw);
          } catch {}
        }
      } else if (queryTarget === "custom" && customPath) {
        const customPathConfig = getLocalConfigPath(customPath);
        if (fs.existsSync(customPathConfig)) {
          try {
            const raw = JSON.parse(fs.readFileSync(customPathConfig, "utf-8"));
            targetConfig = mergeDeep(targetConfig, raw);
          } catch {}
        }
      } else {
        targetConfig = loadMergedConfig(config.projectRoot);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        config: targetConfig,
        currentProject: config.projectRoot.replace(/\\/g, "/"),
        recentProjects: getRecentProjects()
      }));
      return;
    }

    // POST config
    if (url.pathname === "/config" && req.method === "POST") {
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
          void broadcastToTargets(config.debugPort, hotReloadScript);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, savedTo: targetPath }));
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Failed to save config: ${e.message}` }));
        }
      });
      return;
    }

    // GET validate-line
    if (url.pathname === "/validate-line" && req.method === "GET") {
      const fileParam = url.searchParams.get("file");
      const lineParam = url.searchParams.get("line") || "1";
      const columnParam = url.searchParams.get("column") || "1";
      const tagNameParam = url.searchParams.get("tagName") || undefined;
      const classListParam = url.searchParams.get("classList") || undefined;

      if (!fileParam) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
        return;
      }

      let absolutePath = fileParam;
      if (!path.isAbsolute(fileParam)) {
        let cleanFile = fileParam;
        if (cleanFile.startsWith("/")) {
          cleanFile = cleanFile.substring(1);
        }
        absolutePath = path.resolve(config.projectRoot, cleanFile);
      }

      let lineVal = parseInt(lineParam, 10);
      let colVal = parseInt(columnParam, 10);
      const classes = classListParam ? classListParam.split(",") : [];

      const corrected = verifyAndCorrectSourceLocation(absolutePath, lineVal, colVal, tagNameParam, classes);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        original: { line: lineVal, column: colVal },
        corrected: { line: corrected.line, column: corrected.column }
      }));
      return;
    }

    // Open file in Editor/IDE
    if (url.pathname === "/open-in-ide") {
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

      // Resolve relative path using projectRoot
      let absolutePath = fileParam;
      if (!path.isAbsolute(fileParam)) {
        let cleanFile = fileParam;
        if (cleanFile.startsWith("/")) {
          cleanFile = cleanFile.substring(1);
        }
        absolutePath = path.resolve(config.projectRoot, cleanFile);
      }

      if (!fs.existsSync(absolutePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `File not found: ${absolutePath}` }));
        return;
      }

      let lineVal = parseInt(lineParam, 10);
      let colVal = parseInt(columnParam, 10);

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
