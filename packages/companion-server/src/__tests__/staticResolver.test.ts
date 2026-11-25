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

describe("StaticContextResolver HTML element resolving", () => {
  let tempDir: string;
  let htmlPath: string;
  let resolver: StaticContextResolver;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-html-test-"));
    resolver = new StaticContextResolver();

    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    htmlPath = path.join(srcDir, "index.html");
    fs.writeFileSync(
      htmlPath,
      `<!DOCTYPE html>
<html>
<head><title>Test App</title></head>
<body>
  <div class="header">
    <h1 id="ui-title" data-i18n="title">YumeShelf</h1>
    <button class="header-icon-btn refresh-library-btn" id="refresh-library-btn" aria-label="Refresh"></button>
  </div>
  <div id="game-grid-wrapper">
    <div class="game-grid drop-zone" id="fav-grid"></div>
  </div>
</body>
</html>`.trim(),
      "utf-8"
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("should resolve static element by id", () => {
    const location = resolver.resolveStaticHtmlLocation(tempDir, {
      tagName: "h1",
      id: "ui-title",
      attributes: { "data-i18n": "title" }
    });

    expect(location).not.toBeNull();
    expect(location?.fileName).toBe("src/index.html");
    expect(location?.lineNumber).toBe(6);
    expect(location?.framework).toBe("Vanilla");
  });

  it("should resolve static element by classList and attributes", () => {
    const location = resolver.resolveStaticHtmlLocation(tempDir, {
      tagName: "button",
      classList: ["header-icon-btn", "refresh-library-btn"],
      attributes: { "aria-label": "Refresh" }
    });

    expect(location).not.toBeNull();
    expect(location?.fileName).toBe("src/index.html");
    expect(location?.lineNumber).toBe(7);
    expect(location?.framework).toBe("Vanilla");
  });

  it("should resolve container element by class and id", () => {
    const location = resolver.resolveStaticHtmlLocation(tempDir, {
      tagName: "div",
      id: "game-grid-wrapper"
    });

    expect(location).not.toBeNull();
    expect(location?.fileName).toBe("src/index.html");
    expect(location?.lineNumber).toBe(9);
  });
});

describe("StaticContextResolver scan scoping and CSS proximity sorting", () => {
  let rootDir: string;
  let resolver: StaticContextResolver;

  beforeAll(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-scope-test-"));
    resolver = new StaticContextResolver();

    // Create dot-dir .scratch with same filename appearing alphabetically before src/
    const scratchCssDir = path.join(rootDir, ".scratch", "pre-310-frontend", "src", "styles");
    fs.mkdirSync(scratchCssDir, { recursive: true });
    fs.writeFileSync(
      path.join(scratchCssDir, "header-search.css"),
      ".search-input { color: red; }\n",
      "utf-8"
    );

    // Gitignored directory with generated CSS
    const genDir = path.join(rootDir, "generated-styles");
    fs.mkdirSync(genDir, { recursive: true });
    fs.writeFileSync(
      path.join(genDir, "theme.css"),
      ".search-input { color: purple; }\n.kept-btn { color: green; }\n",
      "utf-8"
    );

    // Un-ignored competing folder "archive" vs component directory "src"
    const archiveDir = path.join(rootDir, "archive", "styles");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, "header-search.css"),
      ".search-input { color: gray; }\n",
      "utf-8"
    );

    // Custom dot-dir explicitly opt-in via include
    const storybookDir = path.join(rootDir, ".storybook");
    fs.mkdirSync(storybookDir, { recursive: true });
    fs.writeFileSync(
      path.join(storybookDir, "preview.css"),
      ".story-frame { padding: 8px; }\n",
      "utf-8"
    );

    // Real component and CSS under src/
    const compDir = path.join(rootDir, "src", "renderer", "components");
    const srcCssDir = path.join(rootDir, "src", "styles");
    fs.mkdirSync(compDir, { recursive: true });
    fs.mkdirSync(srcCssDir, { recursive: true });

    fs.writeFileSync(
      path.join(compDir, "SearchBar.tsx"),
      [
        "export function SearchBar() {",
        '  return <input className="search-input" />;',
        "}",
      ].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(srcCssDir, "header-search.css"),
      ".search-input { color: white; }\n",
      "utf-8"
    );

    fs.writeFileSync(
      path.join(rootDir, ".gitignore"),
      "generated-styles/\n*.gen.css\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(srcCssDir, "tokens.gen.css"),
      ".token-cls { color: blue; }\n",
      "utf-8"
    );
  });

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("ignores dot-dirs and prefers shared path prefix src/ over archive/ with zero config", async () => {
    const compFile = path.join(rootDir, "src", "renderer", "components", "SearchBar.tsx");
    const meta = await resolver.resolveStaticContext(
      rootDir,
      compFile,
      2,
      10,
      "input",
      ["search-input", "token-cls", "story-frame"]
    );

    expect(meta.classOrigins["search-input"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, "src", "styles", "header-search.css").replaceAll("\\", "/")
    );
    // Respects .gitignore by default
    expect(meta.classOrigins["token-cls"]).toBeUndefined();
    // Dot-dir .storybook is ignored when not explicitly included
    expect(meta.classOrigins["story-frame"]).toBeUndefined();
  });

  it("supports respectGitignore: false and custom ignore overrides including negation", async () => {
    const compFile = path.join(rootDir, "src", "renderer", "components", "SearchBar.tsx");
    const metaNoGitignore = await resolver.resolveStaticContext(
      rootDir,
      compFile,
      2,
      10,
      "input",
      ["token-cls"],
      { respectGitignore: false }
    );
    expect(metaNoGitignore.classOrigins["token-cls"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, "src", "styles", "tokens.gen.css").replaceAll("\\", "/")
    );

    const metaCustomIgnore = await resolver.resolveStaticContext(
      rootDir,
      compFile,
      2,
      10,
      "input",
      ["search-input", "token-cls"],
      {
        respectGitignore: true,
        ignore: ["src/styles/header-search.css", "!src/styles/tokens.gen.css"],
      }
    );
    expect(metaCustomIgnore.classOrigins["search-input"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, "archive", "styles", "header-search.css").replaceAll("\\", "/")
    );
    expect(metaCustomIgnore.classOrigins["token-cls"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, "src", "styles", "tokens.gen.css").replaceAll("\\", "/")
    );
  });

  it("scopes scanning via include whitelist and allows explicit dot-dir opt-in", async () => {
    const compFile = path.join(rootDir, "src", "renderer", "components", "SearchBar.tsx");
    const metaInclude = await resolver.resolveStaticContext(
      rootDir,
      compFile,
      2,
      10,
      "input",
      ["search-input", "story-frame"],
      { include: ["archive"] }
    );
    expect(metaInclude.classOrigins["search-input"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, "archive", "styles", "header-search.css").replaceAll("\\", "/")
    );
    expect(metaInclude.classOrigins["story-frame"]).toBeUndefined();

    const metaDotInclude = await resolver.resolveStaticContext(
      rootDir,
      compFile,
      2,
      10,
      "input",
      ["story-frame"],
      { include: [".storybook"] }
    );
    expect(metaDotInclude.classOrigins["story-frame"]?.file.replaceAll("\\", "/")).toBe(
      path.join(rootDir, ".storybook", "preview.css").replaceAll("\\", "/")
    );
  });
});
