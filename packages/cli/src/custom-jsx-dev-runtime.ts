import path from "node:path";

const urlParams = new URL(import.meta.url).searchParams;
const originalUrl = urlParams.get("original");

// Dynamically import the original module using top-level await
// @ts-ignore
const original = originalUrl ? await import(originalUrl) : await import("react/jsx-dev-runtime");

export const Fragment = original.Fragment;

export function jsxDEV(type: any, props: any, key: any, isStaticChildren: any, source: any, self: any) {
  if (globalThis.window === undefined && source && props && typeof type === "string") {
    let filePath = source.fileName || "";
    try {
      // Normalize absolute path to relative path based on process CWD
      const relative = path.relative(process.cwd(), filePath).replaceAll("\\", "/");
      filePath = relative;
    } catch {}

    props["data-hoversource-loc"] = `${filePath}:${source.lineNumber}:${source.columnNumber}`;
  }
  return original.jsxDEV(type, props, key, isStaticChildren, source, self);
}

export const jsxsDEV = original.jsxsDEV || jsxDEV;
