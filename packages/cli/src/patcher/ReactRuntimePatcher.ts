import fs from "node:fs";
import path from "node:path";
import { RuntimePatcher } from "./types.js";
import { recordPatchState, removePatchState } from "../utils/patchState.js";

const patchedReactRuntimesList: { path: string; originalContent: string }[] = [];

function patchVendoredReactRuntime(content: string, relPath: string, projectRoot: string): string | null {
  const exportsIdx = content.indexOf("module.exports");
  if (exportsIdx === -1) {
    return null;
  }
  const equalsIdx = content.indexOf("=", exportsIdx);
  const endIdx = content.indexOf(";", exportsIdx);
  if (equalsIdx === -1 || endIdx === -1 || equalsIdx >= endIdx) {
    return null;
  }

  const originalExpr = content.slice(equalsIdx + 1, endIdx).trim();
  const isDev = relPath.includes("dev");
  let wrappedContent = "";
  if (isDev) {
    wrappedContent = `
const original = ${originalExpr};
exports.Fragment = original.Fragment;
exports.jsxDEV = function(type, config, maybeKey, isStaticChildren, source, self) {
  globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config, source);
  return original.jsxDEV(type, config, maybeKey, isStaticChildren, source, self);
};
`;
  } else {
    wrappedContent = `
const original = ${originalExpr};
exports.Fragment = original.Fragment;
exports.jsx = function(type, config, maybeKey, ...args) {
  globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config);
  return original.jsx.call(this, type, config, maybeKey, ...args);
};
exports.jsxs = function(type, config, maybeKey, ...args) {
  globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config);
  return original.jsxs.call(this, type, config, maybeKey, ...args);
};
`;
  }

  return (content.includes('"use strict";') ? '"use strict";\n' : "") + `
// HoverSource Injection Patch
if (!globalThis.__HOVERSOURCE_INJECT_SOURCE__) {
  globalThis.__HOVERSOURCE_INJECT_SOURCE__ = (function() {
    const path = require("path");
    let ssrLogCount = 0;
    
    function getJSXSourceLocation(type) {
      const err = new Error();
      const stack = err.stack || "";

      if (typeof window === "undefined" && ssrLogCount < 200) {
        ssrLogCount++;
        try {
          const lines = stack.split("\\n");
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const normalizedLine = line.replace(/\\\\/g, "/");
            const isFramework = 
              line.includes("jsxDEV") ||
              line.includes("jsxsDEV") ||
              line.includes("node:internal") ||
              line.includes("Module._compile") ||
              line.includes("next-dev-server") ||
              /node_modules[\\/_]react[\\/_]/i.test(normalizedLine) ||
              /node_modules[\\/_]react-dom[\\/_]/i.test(normalizedLine) ||
              /node_modules[\\/_]next[\\/_]/i.test(normalizedLine) ||
              /node_modules[\\/_]scheduler[\\/_]/i.test(normalizedLine) ||
              line.includes("react-jsx-dev-runtime") ||
              line.includes("react-jsx-runtime");

            if (isFramework) {
              continue;
            }
            const match = line.match(/(?:at\\\\s+.*?\\\\s+\\\\(|at\\\\s+)(.*?):(\\\\d+):(\\\\d+)\\\\)?$/);
            if (match) {
              return {
                fileName: match[1],
                lineNumber: parseInt(match[2], 10),
                columnNumber: parseInt(match[3], 10)
              };
            }
          }
        } catch {}
      }
      return null;
    }

    return function(type, config, source) {
      if (!config || typeof type !== "string") return;
      if (config["data-hoversource-loc"]) return;
      
      const loc = source || getJSXSourceLocation(type);
      if (loc) {
        let filePath = loc.fileName || "";
        try {
          if (path.isAbsolute(filePath)) {
            filePath = path.relative(process.cwd(), filePath).replace(/\\\\/g, "/");
          }
        } catch {}
        config["data-hoversource-loc"] = \`\${filePath}:\${loc.lineNumber}:\${loc.columnNumber}\`;
      }
    };
  })();
}
${wrappedContent}
`;
}

function patchSingleReactRuntime(fullPath: string, relPath: string, projectRoot: string) {
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    if (content.includes("HoverSource Injection Patch")) {
      return;
    }

    let newContent = content;

    if (relPath.includes("vendored")) {
      const patched = patchVendoredReactRuntime(content, relPath, projectRoot);
      if (patched) {
        newContent = patched;
      }
    } else {
      // 1. For anonymous function exports, prepend injection as the first statement in the body
      newContent = newContent.replace(
        /exports\.jsxDEV\s*=\s*function\s*\(\s*type,\s*config,\s*maybeKey,\s*isStaticChildren\s*\)\s*\{/g,
        "exports.jsxDEV = function(type, config, maybeKey, isStaticChildren) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config, arguments[4]);"
      );
      newContent = newContent.replace(
        /exports\.jsx\s*=\s*function\s*\(\s*type,\s*config,\s*maybeKey\s*\)\s*\{/g,
        "exports.jsx = function(type, config, maybeKey) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config);"
      );
      newContent = newContent.replace(
        /exports\.jsxs\s*=\s*function\s*\(\s*type,\s*config,\s*maybeKey\s*\)\s*\{/g,
        "exports.jsxs = function(type, config, maybeKey) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(type, config);"
      );

      // 2. For variable assignments, replace with top-level wrappers at module scope
      newContent = newContent.replace(
        "exports.jsxDEV = jsxDEV$1;",
        "exports.jsxDEV = function(t, c, k, s, ...args) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(t, c, s); return jsxDEV$1(t, c, k, s, ...args); };"
      );
      newContent = newContent.replace(
        "exports.jsxDEV = jsxDEV;",
        "exports.jsxDEV = function(t, c, k, s, ...args) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(t, c, s); return jsxDEV(t, c, k, s, ...args); };"
      );
      newContent = newContent.replace(
        "exports.jsx = jsx;",
        "exports.jsx = function(t, c, k, ...args) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(t, c); return jsx(t, c, k, ...args); };"
      );
      newContent = newContent.replace(
        "exports.jsx = jsxWithValidationDynamic;",
        "exports.jsx = function(t, c, k, ...args) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(t, c); return jsxWithValidationDynamic(t, c, k, ...args); };"
      );
      newContent = newContent.replace(
        "exports.jsxs = jsxs;",
        "exports.jsxs = function(t, c, k, ...args) { globalThis.__HOVERSOURCE_INJECT_SOURCE__(t, c); return jsxs(t, c, k, ...args); };"
      );

      // 3. Append the global helper block to the end of the file
      newContent = newContent + `
// HoverSource Injection Patch
globalThis.__HOVERSOURCE_INJECT_SOURCE__ = (function() {
  const path = require("path");
  let ssrLogCount = 0;
  
  function getJSXSourceLocation(type) {
    const err = new Error();
    const stack = err.stack || "";

    if (typeof window === "undefined" && ssrLogCount < 200) {
      ssrLogCount++;
      try {
        const lines = stack.split("\\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const normalizedLine = line.replace(/\\\\/g, "/");
          const isFramework = 
            line.includes("jsxDEV") ||
            line.includes("jsxsDEV") ||
            line.includes("node:internal") ||
            line.includes("Module._compile") ||
            line.includes("next-dev-server") ||
            /node_modules[\\/_]react[\\/_]/i.test(normalizedLine) ||
            /node_modules[\\/_]react-dom[\\/_]/i.test(normalizedLine) ||
            /node_modules[\\/_]next[\\/_]/i.test(normalizedLine) ||
            /node_modules[\\/_]scheduler[\\/_]/i.test(normalizedLine) ||
            line.includes("react-jsx-dev-runtime") ||
            line.includes("react-jsx-runtime");

          if (isFramework) {
            continue;
          }
          const match = line.match(/(?:at\\\\s+.*?\\\\s+\\\\(|at\\\\s+)(.*?):(\\\\d+):(\\\\d+)\\\\)?$/);
          if (match) {
            return {
              fileName: match[1],
              lineNumber: parseInt(match[2], 10),
              columnNumber: parseInt(match[3], 10)
            };
          }
        }
      } catch {}
    }
    return null;
  }

  return function(type, config, source) {
    if (!config || typeof type !== "string") return;
    if (config["data-hoversource-loc"]) return;
    
    const loc = source || getJSXSourceLocation(type);
    if (loc) {
      let filePath = loc.fileName || "";
      try {
        if (path.isAbsolute(filePath)) {
          filePath = path.relative(process.cwd(), filePath).replace(/\\\\/g, "/");
        }
      } catch {}
      config["data-hoversource-loc"] = \`\${filePath}:\${loc.lineNumber}:\${loc.columnNumber}\`;
    }
  };
})();
`;
    }

    if (newContent !== content) {
      recordPatchState(fullPath, content);
      patchedReactRuntimesList.push({ path: fullPath, originalContent: content });
      fs.writeFileSync(fullPath, newContent, "utf-8");
      console.log(`[HoverSource] Temporarily patched React development runtime on disk: ${path.relative(projectRoot, fullPath)}`);
    }
  } catch (err: any) {
    console.warn(`[HoverSource] Failed to patch React runtime in ${path.relative(projectRoot, fullPath)}:`, err.message);
  }
}

export class ReactRuntimePatcher implements RuntimePatcher {
  patch(projectRoot: string): void {
    process.once("exit", () => this.restore());

    const searchDirs = [
      projectRoot,
      path.join(projectRoot, "apps/web")
    ];

    const relativePaths = [
      "node_modules/react/cjs/react-jsx-dev-runtime.development.js",
      "node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js",
      "node_modules/next/dist/compiled/react-experimental/cjs/react-jsx-dev-runtime.development.js",
      "node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.react-server.development.js",
      "node_modules/next/dist/compiled/react-experimental/cjs/react-jsx-dev-runtime.react-server.development.js",
      "node_modules/react/cjs/react-jsx-runtime.development.js",
      "node_modules/next/dist/compiled/react/cjs/react-jsx-runtime.development.js",
      "node_modules/next/dist/compiled/react-experimental/cjs/react-jsx-runtime.development.js",
      "node_modules/next/dist/compiled/react/cjs/react-jsx-runtime.react-server.development.js",
      "node_modules/next/dist/compiled/react-experimental/cjs/react-jsx-runtime.react-server.development.js",
      // Next.js App Router vendored runtimes
      "node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js",
      "node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime.js",
      "node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js",
      "node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js",
      "node_modules/next/dist/esm/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js",
      "node_modules/next/dist/esm/server/route-modules/app-page/vendored/rsc/react-jsx-runtime.js",
      "node_modules/next/dist/esm/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js",
      "node_modules/next/dist/esm/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js"
    ];

    for (const dir of searchDirs) {
      for (const relPath of relativePaths) {
        const fullPath = path.resolve(dir, relPath);
        if (fs.existsSync(fullPath)) {
          patchSingleReactRuntime(fullPath, relPath, projectRoot);
        }
      }
    }
  }

  restore(): void {
    for (const file of patchedReactRuntimesList) {
      try {
        fs.writeFileSync(file.path, file.originalContent, "utf-8");
        removePatchState(file.path);
        console.log(`[HoverSource] Restored React development runtime: ${file.path}`);
      } catch (err: any) {
        console.error(`[HoverSource] Failed to restore React runtime ${file.path}:`, err.message);
      }
    }
    patchedReactRuntimesList.length = 0;
  }
}
