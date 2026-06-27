import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import Module from "node:module";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamically write the CJS wrapper to dist/ if it doesn't exist (since tsc doesn't transpile .cjs files)
const cjsWrapperPath = path.resolve(__dirname, "./custom-jsx-dev-runtime-cjs.cjs");
if (!fs.existsSync(cjsWrapperPath)) {
  const cjsContent = `const path = require("path");
const wrapperPath = module.filename;
const originalPath = (globalThis.__HOVERSOURCE_ORIGINAL_CJS_RUNTIMES__ && globalThis.__HOVERSOURCE_ORIGINAL_CJS_RUNTIMES__[wrapperPath]) || "react/jsx-dev-runtime";
const original = require(originalPath);

exports.Fragment = original.Fragment;

exports.jsxDEV = function(type, props, key, isStaticChildren, source, self) {
  if (typeof window === "undefined" && source && props && typeof type === "string") {
    let filePath = source.fileName || "";
    try {
      const relative = path.relative(process.cwd(), filePath).replace(/\\\\/g, "/");
      filePath = relative;
    } catch {}

    props["data-hoversource-loc"] = \`\${filePath}:\${source.lineNumber}:\${source.columnNumber}\`;
  }
  return original.jsxDEV(type, props, key, isStaticChildren, source, self);
};

exports.jsxsDEV = original.jsxsDEV || exports.jsxDEV;
`;
  fs.writeFileSync(cjsWrapperPath, cjsContent, "utf-8");
}

// 1. Register ESM loader
try {
  const loaderUrl = pathToFileURL(path.resolve(__dirname, "./loader.js")).href;
  register(loaderUrl);
} catch (err: any) {
  if (process.env.DEBUG) {
    console.debug("[HoverSource Bootstrap] Failed to register ESM loader:", err.message);
  }
}

// 2. Patch CommonJS _resolveFilename
try {
  const originalResolve = (Module as any)._resolveFilename;

  // Registry for tracking original runtime paths mapped to the wrapper path
  (globalThis as any).__HOVERSOURCE_ORIGINAL_CJS_RUNTIMES__ = (globalThis as any).__HOVERSOURCE_ORIGINAL_CJS_RUNTIMES__ || {};

  (Module as any)._resolveFilename = function(
    request: string,
    parent: any,
    isMain: boolean,
    options: any
  ) {
    // Check for recursion guard: if parent is the CJS wrapper itself, do not redirect
    const wrapperPath = path.resolve(__dirname, "./custom-jsx-dev-runtime-cjs.cjs");
    const parentFile = parent?.filename || "";

    if (parentFile === wrapperPath) {
      return originalResolve.apply(this, arguments);
    }

    const isTarget = request === "react/jsx-dev-runtime" ||
                     request.endsWith("/react/jsx-dev-runtime") ||
                     request.replace(/\\/g, "/").includes("react/jsx-dev-runtime") ||
                     request.includes("next/dist/compiled/react/jsx-dev-runtime");

    if (isTarget) {
      try {
        const originalPath = originalResolve.apply(this, arguments);
        (globalThis as any).__HOVERSOURCE_ORIGINAL_CJS_RUNTIMES__[wrapperPath] = originalPath;
        return wrapperPath;
      } catch {}
    }

    return originalResolve.apply(this, arguments);
  };
} catch (err: any) {
  if (process.env.DEBUG) {
    console.debug("[HoverSource Bootstrap] Failed to patch CJS resolver:", err.message);
  }
}
