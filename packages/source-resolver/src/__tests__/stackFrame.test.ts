import { describe, it, expect } from "vitest";
import {
  stripQueryAndHash,
  normalizeStackPath,
  parseV8StackLine,
  isBundlerOrRuntimeFrame,
} from "../adapters/stackFrame.js";

describe("stripQueryAndHash", () => {
  it("strips ?query and #hash suffixes while preserving origins and Windows drive letters", () => {
    expect(stripQueryAndHash("http://localhost:5173/src/App.tsx?t=123#section")).toBe(
      "http://localhost:5173/src/App.tsx"
    );
    expect(stripQueryAndHash("D:/Projects/App.tsx?v=abc")).toBe("D:/Projects/App.tsx");
    expect(stripQueryAndHash("/@fs/D:/Projects/App.tsx#top?x=1")).toBe(
      "/@fs/D:/Projects/App.tsx"
    );
    expect(stripQueryAndHash("D:\\Projects\\App.tsx")).toBe("D:\\Projects\\App.tsx");
  });
});

describe("normalizeStackPath", () => {
  it("normalizes Windows and POSIX file:// URLs", () => {
    expect(normalizeStackPath("file:///D:/Projects/App.tsx?t=1")).toEqual({
      fileName: "D:/Projects/App.tsx",
      isHttpUrl: false,
      hadViteFsPrefix: false,
    });
    expect(normalizeStackPath("file:///Users/dev/App.tsx")).toEqual({
      fileName: "/Users/dev/App.tsx",
      isHttpUrl: false,
      hadViteFsPrefix: false,
    });
  });

  it("extracts pathname by default or preserves origin when requested for http(s) URLs", () => {
    expect(
      normalizeStackPath("http://localhost:5173/src/App.tsx?t=123")
    ).toEqual({
      fileName: "/src/App.tsx",
      isHttpUrl: true,
      hadViteFsPrefix: false,
    });

    expect(
      normalizeStackPath("http://localhost:5173/src/App.tsx?t=123", {
        preserveHttpOrigin: true,
      })
    ).toEqual({
      fileName: "http://localhost:5173/src/App.tsx",
      isHttpUrl: true,
      hadViteFsPrefix: false,
    });
  });

  it("strips /@fs/ to filesystem paths for both raw paths and HTTP URLs", () => {
    expect(normalizeStackPath("/@fs/D:/Projects/App.tsx?v=abc")).toEqual({
      fileName: "D:/Projects/App.tsx",
      isHttpUrl: false,
      hadViteFsPrefix: true,
    });
    expect(
      normalizeStackPath("http://localhost:5173/@fs/D:/Projects/App.tsx?v=abc")
    ).toEqual({
      fileName: "D:/Projects/App.tsx",
      isHttpUrl: true,
      hadViteFsPrefix: true,
    });
    expect(normalizeStackPath("/@fs/Users/dev/App.tsx?v=abc")).toEqual({
      fileName: "/Users/dev/App.tsx",
      isHttpUrl: false,
      hadViteFsPrefix: true,
    });
  });
});

describe("parseV8StackLine", () => {
  it("parses V8 frames with function names", () => {
    expect(
      parseV8StackLine(
        "    at MyComponent (http://localhost:5173/src/App.tsx?t=123:45:12)"
      )
    ).toEqual({
      functionName: "MyComponent",
      rawLocation: "http://localhost:5173/src/App.tsx?t=123:45:12",
      fileName: "/src/App.tsx",
      lineNumber: 45,
      columnNumber: 12,
    });
  });

  it("parses anonymous V8 frames across Windows file://, HTTP, and /@fs/ locations", () => {
    expect(parseV8StackLine("    at file:///D:/Projects/App.tsx:14:3")).toEqual({
      rawLocation: "file:///D:/Projects/App.tsx:14:3",
      fileName: "D:/Projects/App.tsx",
      lineNumber: 14,
      columnNumber: 3,
    });

    expect(
      parseV8StackLine("    at http://localhost:5173/src/Main.tsx?t=123:45:12")
    ).toEqual({
      rawLocation: "http://localhost:5173/src/Main.tsx?t=123:45:12",
      fileName: "/src/Main.tsx",
      lineNumber: 45,
      columnNumber: 12,
    });

    expect(
      parseV8StackLine("    at /@fs/D:/Projects/SaveEditor.tsx?v=abc:10:2")
    ).toEqual({
      rawLocation: "/@fs/D:/Projects/SaveEditor.tsx?v=abc:10:2",
      fileName: "D:/Projects/SaveEditor.tsx",
      lineNumber: 10,
      columnNumber: 2,
    });
  });

  it("preserves route-group parentheses inside URL paths", () => {
    expect(
      parseV8StackLine(
        "    at Page (http://localhost:3000/src/app/(dashboard)/page.tsx:10:5)"
      )
    ).toEqual({
      functionName: "Page",
      rawLocation: "http://localhost:3000/src/app/(dashboard)/page.tsx:10:5",
      fileName: "/src/app/(dashboard)/page.tsx",
      lineNumber: 10,
      columnNumber: 5,
    });
  });

  it("returns null for non-frame lines, missing coordinates, or non-positive line/column", () => {
    expect(parseV8StackLine("Error: boom")).toBeNull();
    expect(parseV8StackLine("    at Array.map (<anonymous>)")).toBeNull();
    expect(parseV8StackLine("    at http://localhost:5173/src/App.tsx")).toBeNull();
    expect(parseV8StackLine("    at fn (/src/App.tsx:0:5)")).toBeNull();
    expect(parseV8StackLine("    at fn (/src/App.tsx:5:0)")).toBeNull();
  });
});

describe("isBundlerOrRuntimeFrame", () => {
  it("matches HoverSource overlay, bundler, React runtime, and node:internal frames", () => {
    expect(
      isBundlerOrRuntimeFrame("    at captureSourceLocation (overlay.bundle.js:12:4)")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("    at setupVanillaMonkeyPatch (hoversource-overlay.js:8:1)")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=123:1:1")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("D:\\app\\node_modules\\react\\index.js:10:2")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("http://localhost:5173/.vite/deps/react_jsx-dev-runtime.js:12:3")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("    at jsxDEV (react-jsx-dev-runtime.development.js:42:5)")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("    at react_stack_bottom_frame (react-dom-client.development.js:99:1)")
    ).toBe(true);
    expect(
      isBundlerOrRuntimeFrame("    at Module._compile (node:internal/modules/cjs/loader:1376:14)")
    ).toBe(true);
  });

  it("does not match application source frames", () => {
    expect(
      isBundlerOrRuntimeFrame("    at SaveEditorContent (http://localhost:5173/src/SaveEditorContent.tsx:120:9)")
    ).toBe(false);
  });
});
