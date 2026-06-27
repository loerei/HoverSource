import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wrapperUrl = pathToFileURL(path.resolve(__dirname, "./custom-jsx-dev-runtime.js")).href;

export async function resolve(specifier: string, context: any, nextResolve: any) {
  const parentUrl = context.parentURL || "";

  // Recursion guard: if parent is our wrapper, do not redirect
  if (parentUrl.startsWith(wrapperUrl)) {
    return nextResolve(specifier, context);
  }

  const isTarget = specifier === "react/jsx-dev-runtime" ||
                   specifier.endsWith("/react/jsx-dev-runtime") ||
                   specifier.replace(/\\/g, "/").includes("react/jsx-dev-runtime") ||
                   specifier.includes("next/dist/compiled/react/jsx-dev-runtime");

  if (isTarget) {
    try {
      const originalResult = await nextResolve(specifier, context);
      const originalUrl = originalResult.url;

      // Append the original module URL as a query parameter to the wrapper URL
      const redirectUrl = `${wrapperUrl}?original=${encodeURIComponent(originalUrl)}`;

      return {
        format: "module",
        shortCircuit: true,
        url: redirectUrl
      };
    } catch {}
  }

  return nextResolve(specifier, context);
}

