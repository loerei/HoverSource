import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_CONFIG,
  normalizeProjectPath,
  mergeDeep,
  loadMergedConfig,
  getConfigForTarget,
  registerRecentProject,
  getRecentProjects,
  saveConfigDelta,
  resetConfigTarget,
  deleteConfigTarget,
  parseConfigDelta,
  getConfigValueByPath,
  buildDeltaFromKeyValue,
  writeJsonAtomic,
  ConfigValidationError,
} from "../configStore.js";

describe("configStore", () => {
  let tempDir: string;
  let globalConfigPath: string;
  let projectDir: string;
  let customDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-cfg-test-"));
    globalConfigPath = path.join(tempDir, ".hoversourcerc.global");
    projectDir = path.join(tempDir, "project-a");
    customDir = path.join(tempDir, "project-b");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(customDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("merges hierarchy DEFAULT_CONFIG < global < local using injected globalConfigPath", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({
        theme: "light",
        editor: "cursor",
        snappingThreshold: 25,
        recentProjects: ["/some/project"],
        shortcuts: { toggleUI: { key: "j" } },
      }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(projectDir, ".hoversourcerc"),
      JSON.stringify({
        theme: "system",
        maxTraversalDepth: 48,
      }),
      "utf-8"
    );

    const merged = loadMergedConfig(projectDir, globalConfigPath);
    expect(merged.theme).toBe("system");
    expect(merged.editor).toBe("cursor");
    expect(merged.snappingThreshold).toBe(25);
    expect(merged.maxTraversalDepth).toBe(48);
    expect(merged.desnappingThreshold).toBe(DEFAULT_CONFIG.desnappingThreshold);
    expect(merged.shortcuts.toggleUI).toEqual({
      key: "j",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
    });
    expect((merged as unknown as Record<string, unknown>).recentProjects).toBeUndefined();
  });

  it("loads target configs independently for global, local, and custom", () => {
    fs.writeFileSync(globalConfigPath, JSON.stringify({ theme: "light", recentProjects: [projectDir] }), "utf-8");
    fs.writeFileSync(path.join(projectDir, ".hoversourcerc"), JSON.stringify({ editor: "cursor" }), "utf-8");
    fs.writeFileSync(path.join(customDir, ".hoversourcerc"), JSON.stringify({ maxTraversalDepth: 64 }), "utf-8");

    const globalOnly = getConfigForTarget("global", null, projectDir, globalConfigPath);
    expect(globalOnly.theme).toBe("light");
    expect(globalOnly.editor).toBe("vscode");
    expect((globalOnly as unknown as Record<string, unknown>).recentProjects).toBeUndefined();

    const localOnly = getConfigForTarget("local", null, projectDir, globalConfigPath);
    expect(localOnly.theme).toBe("dark");
    expect(localOnly.editor).toBe("cursor");

    const customOnly = getConfigForTarget("custom", customDir, projectDir, globalConfigPath);
    expect(customOnly.theme).toBe("dark");
    expect(customOnly.maxTraversalDepth).toBe(64);
  });

  it("registers, deduplicates, and caps recent projects in injected globalConfigPath", () => {
    for (let i = 0; i < 12; i++) {
      registerRecentProject(path.join(tempDir, `proj-${i}`), globalConfigPath);
    }
    const p5 = path.join(tempDir, "proj-5");
    const altCasing = /^[a-zA-Z]:/.test(p5) ? p5[0].toLowerCase() + p5.slice(1) : p5;
    registerRecentProject(altCasing, globalConfigPath);

    const recent = getRecentProjects(globalConfigPath);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toBe(normalizeProjectPath(path.join(tempDir, "proj-2")));
    expect(recent[9]).toBe(normalizeProjectPath(path.join(tempDir, "proj-11")));
  });

  it("validates allowed keys, enums, types, and numeric bounds in parseConfigDelta", () => {
    const valid = parseConfigDelta({
      theme: "light",
      editor: "code",
      snappingThreshold: 0,
      desnappingThreshold: 100,
      maxTraversalDepth: 8,
      webAppDevServerTimeout: 60,
      layerPickerEnabled: false,
      minimalModeByDefault: true,
      autoResolvePortConflicts: true,
      layerPickerScroll: { altKey: false, ctrlKey: true },
      shortcuts: {
        toggleMode: { key: "z", altKey: true, ctrlKey: false, shiftKey: true },
      },
      metadataFilter: {
        panelPosition: { x: 10, y: 20 },
        filters: { component: { componentName: false } },
      },
    });
    expect(valid.ok).toBe(true);

    expect(parseConfigDelta(null).ok).toBe(false);
    expect(parseConfigDelta([]).ok).toBe(false);
    expect(parseConfigDelta({ unknownKey: 1 }).ok).toBe(false);
    expect(parseConfigDelta({ theme: "neon" }).ok).toBe(false);
    expect(parseConfigDelta({ editor: "vim" }).ok).toBe(false);
    expect(parseConfigDelta({ maxTraversalDepth: 5 }).ok).toBe(false);
    expect(parseConfigDelta({ maxTraversalDepth: 101 }).ok).toBe(false);
    expect(parseConfigDelta({ maxTraversalDepth: 12.5 }).ok).toBe(false);
    expect(parseConfigDelta({ snappingThreshold: -1 }).ok).toBe(false);
    expect(parseConfigDelta({ desnappingThreshold: 101 }).ok).toBe(false);
    expect(parseConfigDelta({ webAppDevServerTimeout: 0 }).ok).toBe(false);
    expect(parseConfigDelta({ layerPickerEnabled: "true" }).ok).toBe(false);
    expect(parseConfigDelta({ shortcuts: { badAction: { key: "a" } } }).ok).toBe(false);
    expect(parseConfigDelta({ shortcuts: { toggleUI: { extra: true } } }).ok).toBe(false);
    expect(parseConfigDelta({ layerPickerScroll: { key: "a" } }).ok).toBe(false);
    expect(parseConfigDelta({ metadataFilter: { filters: { component: { componentName: "yes" } } } }).ok).toBe(false);
  });

  it("gets dot-path values and builds validated deltas via buildDeltaFromKeyValue", () => {
    expect(getConfigValueByPath(DEFAULT_CONFIG, "theme")).toBe("dark");
    expect(getConfigValueByPath(DEFAULT_CONFIG, "shortcuts.toggleUI.key")).toBe("h");
    expect(getConfigValueByPath(DEFAULT_CONFIG, "metadataFilter.filters.component.componentName")).toBe(true);
    expect(getConfigValueByPath(DEFAULT_CONFIG, "nonexistent.path")).toBeUndefined();
    expect(getConfigValueByPath(DEFAULT_CONFIG, "__proto__")).toBeUndefined();

    expect(buildDeltaFromKeyValue("theme", "light")).toEqual({ ok: true, value: { theme: "light" } });
    expect(buildDeltaFromKeyValue("layerPickerEnabled", "false")).toEqual({
      ok: true,
      value: { layerPickerEnabled: false },
    });
    expect(buildDeltaFromKeyValue("maxTraversalDepth", "64")).toEqual({
      ok: true,
      value: { maxTraversalDepth: 64 },
    });
    expect(buildDeltaFromKeyValue("shortcuts.toggleUI.altKey", "false")).toEqual({
      ok: true,
      value: { shortcuts: { toggleUI: { altKey: false } } },
    });
    expect(buildDeltaFromKeyValue("layerPickerScroll.ctrlKey", "true")).toEqual({
      ok: true,
      value: { layerPickerScroll: { ctrlKey: true } },
    });

    expect(buildDeltaFromKeyValue("unknownKey", "1").ok).toBe(false);
    expect(buildDeltaFromKeyValue("maxTraversalDepth", "5").ok).toBe(false);
    expect(buildDeltaFromKeyValue("maxTraversalDepth", "12abc").ok).toBe(false);
    expect(buildDeltaFromKeyValue("minimalModeByDefault", "yes").ok).toBe(false);
    expect(buildDeltaFromKeyValue("theme", "solarized").ok).toBe(false);
  });

  it("writes atomically without leaving .tmp sibling files", () => {
    const target = path.join(projectDir, ".hoversourcerc");
    writeJsonAtomic(target, { theme: "light" });

    expect(JSON.parse(fs.readFileSync(target, "utf-8"))).toEqual({ theme: "light" });
    const files = fs.readdirSync(projectDir);
    expect(files).toEqual([".hoversourcerc"]);
  });

  it("quarantines corrupt JSON files with console.warn and falls back cleanly", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const localPath = path.join(projectDir, ".hoversourcerc");
    fs.writeFileSync(localPath, "{ invalid json", "utf-8");

    const merged = loadMergedConfig(projectDir, globalConfigPath);
    expect(merged.theme).toBe(DEFAULT_CONFIG.theme);
    expect(fs.existsSync(localPath)).toBe(false);

    const files = fs.readdirSync(projectDir);
    expect(files.some((f) => f.startsWith(".hoversourcerc.corrupt."))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("saves, resets, and deletes targets without mutating os.homedir()", () => {
    registerRecentProject(projectDir, globalConfigPath);
    const saveRes = saveConfigDelta({ theme: "light" }, "global", projectDir, null, globalConfigPath);
    expect(saveRes.config.theme).toBe("light");
    expect(getRecentProjects(globalConfigPath)).toEqual([normalizeProjectPath(projectDir)]);

    expect(() =>
      saveConfigDelta({ maxTraversalDepth: 2 }, "local", projectDir, null, globalConfigPath)
    ).toThrow(ConfigValidationError);

    saveConfigDelta({ editor: "cursor" }, "custom", projectDir, customDir, globalConfigPath);
    expect(getRecentProjects(globalConfigPath)).toContain(normalizeProjectPath(customDir));

    const resetRes = resetConfigTarget("global", projectDir, null, globalConfigPath);
    expect(resetRes.config.theme).toBe("dark");
    expect(getRecentProjects(globalConfigPath)).toContain(normalizeProjectPath(projectDir));

    const deleteRes = deleteConfigTarget("custom", projectDir, customDir, false, globalConfigPath);
    expect(deleteRes.deletedFile).toBe(true);
    expect(deleteRes.removedRecent).toBe(true);
    expect(fs.existsSync(path.join(customDir, ".hoversourcerc"))).toBe(false);
    expect(getRecentProjects(globalConfigPath)).not.toContain(normalizeProjectPath(customDir));
  });

  it("prevents prototype pollution in mergeDeep", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}');
    const merged = mergeDeep({}, payload);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(merged, "__proto__")).toBe(false);
  });

  it("validates ports config defaults, bounds, conflict policy, dot-paths, and null/auto clearing", () => {
    expect(DEFAULT_CONFIG.ports).toEqual({
      companion: 7300,
      debug: 9222,
      companionConflict: "shift",
    });

    // Valid ports delta
    const validPorts = parseConfigDelta({
      ports: {
        companion: 7400,
        debug: 9223,
        proxy: 8080,
        dev: 3000,
        companionConflict: "takeover",
      },
    });
    expect(validPorts.ok).toBe(true);

    // Invalid bounds & fields
    expect(parseConfigDelta({ ports: "invalid" }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { companion: 0 } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { companion: 65536 } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { debug: 9222.5 } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { proxy: 0 } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { dev: 70000 } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { companion: null } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { companionConflict: "ignore" } }).ok).toBe(false);
    expect(parseConfigDelta({ ports: { unknownPort: 1234 } }).ok).toBe(false);

    // Dot-path buildDeltaFromKeyValue
    expect(buildDeltaFromKeyValue("ports.debug", "9223")).toEqual({
      ok: true,
      value: { ports: { debug: 9223 } },
    });
    expect(buildDeltaFromKeyValue("ports.dev", "auto")).toEqual({
      ok: true,
      value: { ports: { dev: null } },
    });
    expect(buildDeltaFromKeyValue("ports.proxy", "NULL")).toEqual({
      ok: true,
      value: { ports: { proxy: null } },
    });
    expect(buildDeltaFromKeyValue("ports.companionConflict", "fail")).toEqual({
      ok: true,
      value: { ports: { companionConflict: "fail" } },
    });
    expect(buildDeltaFromKeyValue("ports.companion", "0").ok).toBe(false);
    expect(buildDeltaFromKeyValue("ports.unknown", "1234").ok).toBe(false);

    // Save and clear persisted ports.dev / ports.proxy via null / auto
    const saved = saveConfigDelta(
      { ports: { proxy: 8081, dev: 5173, companionConflict: "fail" } },
      "local",
      projectDir,
      null,
      globalConfigPath
    );
    expect(saved.config.ports).toEqual({
      companion: 7300,
      debug: 9222,
      proxy: 8081,
      dev: 5173,
      companionConflict: "fail",
    });

    const clearedDev = saveConfigDelta(
      { ports: { dev: null, proxy: null } },
      "local",
      projectDir,
      null,
      globalConfigPath
    );
    expect(clearedDev.config.ports?.dev).toBeUndefined();
    expect(clearedDev.config.ports?.proxy).toBeUndefined();

    const rawOnDisk = JSON.parse(fs.readFileSync(path.join(projectDir, ".hoversourcerc"), "utf-8"));
    expect(Object.prototype.hasOwnProperty.call(rawOnDisk.ports, "dev")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawOnDisk.ports, "proxy")).toBe(false);
  });
});
