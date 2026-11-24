import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizeProjectPath, startCompanionServer } from "../server.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("normalizeProjectPath", () => {
  it("should normalize backslashes to forward slashes", () => {
    const result = normalizeProjectPath("C:\\Projects\\HoverSource");
    expect(result).toBe("C:/Projects/HoverSource");
  });

  it("should force Windows drive letter to uppercase", () => {
    const lowercaseResult = normalizeProjectPath("d:/Projects/HoverSource");
    const uppercaseResult = normalizeProjectPath("D:/Projects/HoverSource");
    
    expect(lowercaseResult).toBe("D:/Projects/HoverSource");
    expect(uppercaseResult).toBe("D:/Projects/HoverSource");
  });

  it("should handle mixed slashes and lowercase drive letters", () => {
    const result = normalizeProjectPath("c:\\projects/HoverSource\\subfolder");
    expect(result).toBe("C:/projects/HoverSource/subfolder");
  });
});

describe("Companion Server /resolve-html-element route", () => {
  let tempDir: string;
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-srv-test-"));
    const htmlPath = path.join(tempDir, "index.html");
    fs.writeFileSync(htmlPath, `<html><body><h1 id="test-header">Hello</h1></body></html>`, "utf-8");

    testPort = 59870 + Math.floor(Math.random() * 1000);
    server = startCompanionServer({
      port: testPort,
      projectRoot: tempDir,
      debugPort: 9222
    });

    // Wait for server to bind
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        resolve();
      });
    });
  });

  it("should return resolved static HTML location over HTTP", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/resolve-html-element?tagName=h1&id=test-header`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.fileName).toBe("index.html");
    expect(data.lineNumber).toBe(1);
    expect(data.framework).toBe("Vanilla");
  });
});
