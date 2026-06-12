import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { StaticContextResolver } from "../staticResolver.js";

describe("StaticContextResolver CSS and Preprocessor resolving", () => {
  let tempDir: string;
  let componentPath: string;
  let globalCssPath: string;
  let appScssPath: string;
  let appLessPath: string;
  let resolver: StaticContextResolver;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-test-"));
    resolver = new StaticContextResolver();

    componentPath = path.join(tempDir, "App.tsx");
    fs.writeFileSync(
      componentPath,
      `
import React from 'react';
import './App.module.scss';

export function App() {
  return (
    <div className="App_container__xyz12">
      <header className="App_header__xyz12">
        <h1 className="App_title__xyz12">Hello</h1>
      </header>
      <div className="card-body">
        <button className="card-btn">Click me</button>
      </div>
    </div>
  );
}
      `.trim(),
      "utf-8"
    );

    globalCssPath = path.join(tempDir, "global.css");
    fs.writeFileSync(
      globalCssPath,
      `
.global-main {
  color: black;
}
.card-body {
  padding: 20px;
}
      `.trim(),
      "utf-8"
    );

    appScssPath = path.join(tempDir, "App.module.scss");
    fs.writeFileSync(
      appScssPath,
      `
.container {
  display: flex;
  
  .header {
    background: blue;
    
    .title {
      font-size: 24px;
    }
  }
}

.card {
  border: 1px solid ccc;
  
  &-btn {
    color: white;
    background: green;
  }
}
      `.trim(),
      "utf-8"
    );

    appLessPath = path.join(tempDir, "App.less");
    fs.writeFileSync(
      appLessPath,
      `
.my-less-component {
  padding: 10px;
  
  .less-child {
    color: red;
  }
}
      `.trim(),
      "utf-8"
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("should resolve basic class names in .css files", async () => {
    const result = await resolver.resolveStaticContext(
      tempDir,
      componentPath,
      12,
      7,
      "div",
      ["card-body"]
    );

    expect(result.classOrigins["card-body"]).toBeDefined();
    expect(result.classOrigins["card-body"].file).toBe(globalCssPath.replaceAll("\\", "/"));
    expect(result.classOrigins["card-body"].line).toBe(4);
  });

  it("should resolve CSS module hashed class names", async () => {
    const result = await resolver.resolveStaticContext(
      tempDir,
      componentPath,
      8,
      7,
      "header",
      ["App_header__xyz12"]
    );

    expect(result.classOrigins["App_header__xyz12"]).toBeDefined();
    expect(result.classOrigins["App_header__xyz12"].file).toBe(appScssPath.replaceAll("\\", "/"));
    expect(result.classOrigins["App_header__xyz12"].line).toBe(4);
  });

  it("should resolve deeply nested selectors", async () => {
    const result = await resolver.resolveStaticContext(
      tempDir,
      componentPath,
      9,
      9,
      "h1",
      ["App_title__xyz12"]
    );

    expect(result.classOrigins["App_title__xyz12"]).toBeDefined();
    expect(result.classOrigins["App_title__xyz12"].file).toBe(appScssPath.replaceAll("\\", "/"));
    expect(result.classOrigins["App_title__xyz12"].line).toBe(7);
  });

  it("should resolve nested Sass selector using ampersand", async () => {
    const result = await resolver.resolveStaticContext(
      tempDir,
      componentPath,
      13,
      9,
      "button",
      ["card-btn"]
    );

    expect(result.classOrigins["card-btn"]).toBeDefined();
    expect(result.classOrigins["card-btn"].file).toBe(appScssPath.replaceAll("\\", "/"));
    expect(result.classOrigins["card-btn"].line).toBe(16);
  });

  it("should resolve nested selectors in Less files", async () => {
    const result = await resolver.resolveStaticContext(
      tempDir,
      componentPath,
      1,
      1,
      "div",
      ["less-child"]
    );

    expect(result.classOrigins["less-child"]).toBeDefined();
    expect(result.classOrigins["less-child"].file).toBe(appLessPath.replaceAll("\\", "/"));
    expect(result.classOrigins["less-child"].line).toBe(4);
  });
});
