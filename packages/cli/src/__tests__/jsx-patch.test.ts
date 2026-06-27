import { describe, it, expect } from "vitest";

// Port of the on-disk getJSXSourceLocation and cleaning logic for testing
function parseJSXSourceFromStack(stack: string): { fileName: string; lineNumber: number; columnNumber: number } | null {
  const lines = stack.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const normalizedLine = line.replace(/\\/g, "/");
    const isFramework = 
      line.includes("jsxDEV") ||
      line.includes("jsxsDEV") ||
      line.includes("node:internal") ||
      line.includes("Module._compile") ||
      line.includes("next-dev-server") ||
      /node_modules[/_]react[/_]/i.test(normalizedLine) ||
      /node_modules[/_]react-dom[/_]/i.test(normalizedLine) ||
      /node_modules[/_]next[/_]/i.test(normalizedLine) ||
      /node_modules[/_]scheduler[/_]/i.test(normalizedLine) ||
      line.includes("react-jsx-dev-runtime");

    if (isFramework) {
      continue;
    }
    const match = line.match(/(?:at\s+.*?\s+\(|at\s+)(.*?):(\d+):(\d+)\)?$/);
    if (match) {
      let fileName = match[1];

      // Browser chunk URL translation
      if (fileName.startsWith("http://") || fileName.startsWith("https://") || fileName.includes("/_next/static/chunks/")) {
        let cleaned = fileName.replace(/^https?:\/\/[^\/]+/, "");
        cleaned = cleaned.replace(/^\/_next\/static\/chunks\//, "");
        cleaned = cleaned.split("?")[0];

        const extMatch = cleaned.match(/_(tsx|ts|jsx|js)(?:\._)?\.js$/);
        if (extMatch) {
          const ext = extMatch[1];
          cleaned = cleaned.replace(/_(tsx|ts|jsx|js)(?:\._)?\.js$/, "." + ext);
          cleaned = cleaned.replace(/_/g, "/");
        } else {
          cleaned = cleaned.replace(/\._\.js$/, ".js").replace(/_/g, "/");
        }
        fileName = cleaned;
      }

      return {
        fileName,
        lineNumber: parseInt(match[2], 10),
        columnNumber: parseInt(match[3], 10)
      };
    }
  }
  return null;
}

describe("JSX Location Stack Trace Parsing", () => {
  it("should extract absolute paths on Node.js server side", () => {
    const stack = `Error
    at exports.jsxDEV (D:\\Projects\\HoverSource\\packages\\cli\\dist\\custom-jsx-dev-runtime.js:10:15)
    at Page (D:\\Projects\\cal.diy\\apps\\web\\pages\\index.tsx:25:3)
    at renderWithHooks (D:\\Projects\\cal.diy\\node_modules\\react-dom\\cjs\\react-dom-server.node.development.js:567:12)`;

    const result = parseJSXSourceFromStack(stack);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("D:\\Projects\\cal.diy\\apps\\web\\pages\\index.tsx");
    expect(result?.lineNumber).toBe(25);
    expect(result?.columnNumber).toBe(3);
  });

  it("should translate browser chunk URLs with .tsx extension to relative paths", () => {
    const stack = `Error
    at jsxDEV (http://localhost:13000/_next/static/chunks/node_modules_next_0yl683b._.js:1023:25)
    at Page (http://localhost:13000/_next/static/chunks/apps_web_pages_index_tsx.js:25:3)`;

    const result = parseJSXSourceFromStack(stack);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("apps/web/pages/index.tsx");
    expect(result?.lineNumber).toBe(25);
    expect(result?.columnNumber).toBe(3);
  });

  it("should translate browser chunk URLs with .ts extension and hyphens to relative paths", () => {
    const stack = `Error
    at jsxDEV (http://localhost:13000/_next/static/chunks/node_modules_next_0yl683b._.js:1023:25)
    at Page (http://localhost:13000/_next/static/chunks/packages_features_event-types_components_event-type-list_tsx._.js:50:10)`;

    const result = parseJSXSourceFromStack(stack);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("packages/features/event-types/components/event-type-list.tsx");
    expect(result?.lineNumber).toBe(50);
    expect(result?.columnNumber).toBe(10);
  });

  it("should translate browser chunk URLs when the jsxDEV function name is omitted in the stack frame", () => {
    const stack = `Error
    at http://localhost:13000/_next/static/chunks/node_modules_next_0yl683b._.js:1023:25
    at Page (http://localhost:13000/_next/static/chunks/apps_web_pages_index_tsx.js:25:3)`;

    const result = parseJSXSourceFromStack(stack);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("apps/web/pages/index.tsx");
    expect(result?.lineNumber).toBe(25);
    expect(result?.columnNumber).toBe(3);
  });

  it("should skip node_modules/react framework frames but keep monorepo symlinked packages", () => {
    const stack = `Error
    at exports.jsxDEV (D:\\Projects\\HoverSource\\packages\\cli\\dist\\custom-jsx-dev-runtime.js:10:15)
    at Object.jsxDEV (D:\\Projects\\cal.diy\\node_modules\\react\\cjs\\react-jsx-dev-runtime.development.js:327:12)
    at Button (D:\\Projects\\cal.diy\\node_modules\\@calcom\\ui\\components\\Button.tsx:42:15)
    at Page (D:\\Projects\\cal.diy\\apps\\web\\pages\\index.tsx:25:3)`;

    const result = parseJSXSourceFromStack(stack);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("D:\\Projects\\cal.diy\\node_modules\\@calcom\\ui\\components\\Button.tsx");
    expect(result?.lineNumber).toBe(42);
    expect(result?.columnNumber).toBe(15);
  });
});
