import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveFilePath, verifyAndCorrectSourceLocation } from "../sourceLocation.js";

describe("resolveFilePath", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-loc-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns absolute paths unchanged", () => {
    const absPath = path.join(tempRoot, "src", "App.tsx");
    expect(resolveFilePath(absPath, tempRoot)).toBe(absPath);
  });

  it("resolves direct relative paths under projectRoot", () => {
    const directRoot = path.join(tempRoot, "Button.tsx");
    fs.writeFileSync(directRoot, "export function Button() {}", "utf-8");

    const nestedTarget = path.join(tempRoot, "components", "NestedButton.tsx");
    fs.mkdirSync(path.dirname(nestedTarget), { recursive: true });
    fs.writeFileSync(nestedTarget, "export function NestedButton() {}", "utf-8");

    expect(resolveFilePath("Button.tsx", tempRoot)).toBe(directRoot);
    expect(resolveFilePath("http://localhost:5173/components/NestedButton.tsx", tempRoot)).toBe(
      nestedTarget
    );
  });

  it("resolves paths under src/ when not directly at projectRoot", () => {
    const target = path.join(tempRoot, "src", "Card.tsx");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export function Card() {}", "utf-8");

    const nestedTarget = path.join(tempRoot, "src", "components", "NestedCard.tsx");
    fs.mkdirSync(path.dirname(nestedTarget), { recursive: true });
    fs.writeFileSync(nestedTarget, "export function NestedCard() {}", "utf-8");

    expect(resolveFilePath("Card.tsx", tempRoot)).toBe(target);
    expect(resolveFilePath("http://localhost:5173/components/NestedCard.tsx", tempRoot)).toBe(
      nestedTarget
    );
  });

  it("strips [project]/ and http://localhost:5173/ prefixes", () => {
    const target = path.join(tempRoot, "src", "App.tsx");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export function App() {}", "utf-8");

    expect(resolveFilePath("[project]/src/App.tsx", tempRoot)).toBe(target);
    expect(resolveFilePath("http://localhost:5173/src/App.tsx", tempRoot)).toBe(target);
  });

  it("resolves symlinked packages in node_modules", () => {
    const realPkgDir = path.join(tempRoot, "external-ui");
    const target = path.join(realPkgDir, "src", "Badge.tsx");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export function Badge() {}", "utf-8");

    const nodeModulesDir = path.join(tempRoot, "node_modules");
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    const linkPath = path.join(nodeModulesDir, "ui-kit");
    fs.symlinkSync(
      realPkgDir,
      linkPath,
      process.platform === "win32" ? "junction" : "dir"
    );

    expect(resolveFilePath("http://localhost:5173/ui-kit/src/Badge.tsx", tempRoot)).toBe(
      fs.realpathSync(target)
    );
  });

  it("resolves monorepo package paths under packages/ and apps/", () => {
    const uiTarget = path.join(tempRoot, "packages", "ui", "components", "Input.tsx");
    fs.mkdirSync(path.dirname(uiTarget), { recursive: true });
    fs.writeFileSync(uiTarget, "export function Input() {}", "utf-8");

    const appTarget = path.join(tempRoot, "apps", "web", "pages", "Home.tsx");
    fs.mkdirSync(path.dirname(appTarget), { recursive: true });
    fs.writeFileSync(appTarget, "export function Home() {}", "utf-8");

    expect(resolveFilePath("http://localhost:5173/components/Input.tsx", tempRoot)).toBe(
      uiTarget
    );
    expect(resolveFilePath("http://localhost:5173/ui/components/Input.tsx", tempRoot)).toBe(
      uiTarget
    );
    expect(resolveFilePath("http://localhost:5173/web/pages/Home.tsx", tempRoot)).toBe(
      appTarget
    );
  });
});

describe("verifyAndCorrectSourceLocation", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-verify-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("keeps original line and column when current line matches tag or class", () => {
    const filePath = path.join(tempRoot, "Button.tsx");
    fs.writeFileSync(
      filePath,
      [
        "export function Button() {",
        '  return <button className="primary-btn">Click</button>;',
        "}",
      ].join("\n"),
      "utf-8"
    );

    expect(
      verifyAndCorrectSourceLocation(filePath, 2, 10, "button", ["primary-btn"])
    ).toEqual({ line: 2, column: 10 });
  });

  it("falls back to class search when reported line does not match", () => {
    const filePath = path.join(tempRoot, "Panel.tsx");
    fs.writeFileSync(
      filePath,
      [
        "export function Panel() {",
        "  const label = 'Header';",
        '  return <div className="panel-shell">',
        '    <span className="panel-title">{label}</span>',
        "  </div>;",
        "}",
      ].join("\n"),
      "utf-8"
    );

    const expectedCol = '    <span className="panel-title">{label}</span>'.indexOf("panel-title") + 1;
    expect(
      verifyAndCorrectSourceLocation(filePath, 1, 1, "span", ["panel-title"])
    ).toEqual({ line: 4, column: expectedCol });
  });

  it("falls back to nearest matching tag when no class matches", () => {
    const filePath = path.join(tempRoot, "List.tsx");
    fs.writeFileSync(
      filePath,
      [
        "export function List() {",
        "  return (",
        "    <ul>",
        "      <li>First</li>",
        "      <li>Second</li>",
        "    </ul>",
        "  );",
        "}",
      ].join("\n"),
      "utf-8"
    );

    expect(
      verifyAndCorrectSourceLocation(filePath, 6, 3, "li", ["missing-class"])
    ).toEqual({ line: 5, column: 7 });
  });

  it("returns original coordinates when file does not exist", () => {
    const missingFile = path.join(tempRoot, "Missing.tsx");
    expect(
      verifyAndCorrectSourceLocation(missingFile, 12, 4, "div", ["foo"])
    ).toEqual({ line: 12, column: 4 });
  });
});
