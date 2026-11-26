import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_CONFIG,
  CURRENT_CONFIG_SCHEMA_VERSION,
  migrateConfigObject,
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
  listPresets,
  savePreset,
  usePreset,
  deletePreset,
  bindRepoPreset,
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
      metaKey: false,
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

  it("supports metaKey on shortcuts and layerPickerScroll plus toggleFilterPanel default and validation", () => {
    expect(DEFAULT_CONFIG.shortcuts.toggleFilterPanel).toEqual({
      key: "d",
      altKey: true,
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
    });
    expect(getConfigValueByPath(DEFAULT_CONFIG, "shortcuts.toggleFilterPanel.key")).toBe("d");
    expect(getConfigValueByPath(DEFAULT_CONFIG, "shortcuts.toggleUI.metaKey")).toBe(false);

    const valid = parseConfigDelta({
      layerPickerScroll: { altKey: false, ctrlKey: false, shiftKey: false, metaKey: true },
      shortcuts: {
        toggleFilterPanel: { key: "k", altKey: false, ctrlKey: false, shiftKey: true, metaKey: true },
      },
    });
    expect(valid.ok).toBe(true);

    expect(parseConfigDelta({ shortcuts: { toggleFilterPanel: { metaKey: "yes" } } }).ok).toBe(false);
    expect(parseConfigDelta({ layerPickerScroll: { metaKey: 1 } }).ok).toBe(false);

    expect(buildDeltaFromKeyValue("shortcuts.toggleFilterPanel.metaKey", "true")).toEqual({
      ok: true,
      value: { shortcuts: { toggleFilterPanel: { metaKey: true } } },
    });
    expect(buildDeltaFromKeyValue("layerPickerScroll.metaKey", "true")).toEqual({
      ok: true,
      value: { layerPickerScroll: { metaKey: true } },
    });

    const saved = saveConfigDelta(
      {
        shortcuts: { toggleFilterPanel: { key: "f", metaKey: true, ctrlKey: false } },
        layerPickerScroll: { metaKey: true },
      },
      "local",
      projectDir,
      null,
      globalConfigPath
    );
    expect(saved.config.shortcuts.toggleFilterPanel).toEqual({
      key: "f",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: true,
    });
    expect(saved.config.layerPickerScroll).toEqual({ metaKey: true });

    // Legacy .hoversourcerc without metaKey or toggleFilterPanel still merges cleanly
    fs.writeFileSync(
      path.join(customDir, ".hoversourcerc"),
      JSON.stringify({ shortcuts: { toggleUI: { key: "u", altKey: true, ctrlKey: false, shiftKey: false } } }),
      "utf-8"
    );
    const legacyMerged = loadMergedConfig(customDir, globalConfigPath);
    expect(legacyMerged.shortcuts.toggleUI.key).toBe("u");
    expect(legacyMerged.shortcuts.toggleUI.metaKey).toBe(false);
    expect(legacyMerged.shortcuts.toggleFilterPanel).toEqual(DEFAULT_CONFIG.shortcuts.toggleFilterPanel);
  });

  it("manages named presets CRUD, precedence (DEFAULT -> global -> preset -> local), and port isolation", () => {
    saveConfigDelta(
      {
        theme: "light",
        editor: "cursor",
        autoResolvePortConflicts: true,
        ports: { companion: 7450, debug: 9333, proxy: 8088 },
      },
      "global",
      projectDir,
      null,
      globalConfigPath
    );
    registerRecentProject(projectDir, globalConfigPath);

    // Save preset with explicit partial config; machine/port fields must be excluded
    const savedFigma = savePreset(
      "figma",
      {
        theme: "system",
        minimalModeByDefault: true,
        shortcuts: { toggleUI: { key: "k", metaKey: true, altKey: false } },
        ports: { companion: 9999 },
        autoResolvePortConflicts: false,
      } as unknown as Record<string, unknown>,
      projectDir,
      globalConfigPath
    );
    expect(savedFigma.name).toBe("figma");
    expect((savedFigma.preset as Record<string, unknown>).ports).toBeUndefined();
    expect((savedFigma.preset as Record<string, unknown>).autoResolvePortConflicts).toBeUndefined();

    // Activate preset and verify DEFAULT -> global -> preset precedence + port isolation
    const used = usePreset("figma", projectDir, globalConfigPath);
    expect(used.activePreset).toBe("figma");
    expect(used.config.theme).toBe("system");
    expect(used.config.minimalModeByDefault).toBe(true);
    expect(used.config.editor).toBe("cursor");
    expect(used.config.shortcuts.toggleUI).toEqual({
      key: "k",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: true,
    });
    expect(used.config.ports?.companion).toBe(7450);
    expect(used.config.ports?.debug).toBe(9333);
    expect(used.config.ports?.proxy).toBe(8088);
    expect(used.config.autoResolvePortConflicts).toBe(true);
    expect((used.config as unknown as Record<string, unknown>).presets).toBeUndefined();
    expect((used.config as unknown as Record<string, unknown>).activePreset).toBeUndefined();

    // Snapshot current merged config into another preset
    saveConfigDelta({ snappingThreshold: 40, theme: "dark" }, "local", projectDir, null, globalConfigPath);
    const snap = savePreset("work", null, projectDir, globalConfigPath);
    expect(snap.preset.snappingThreshold).toBe(40);
    expect(snap.preset.theme).toBe("dark");
    expect((snap.preset as Record<string, unknown>).ports).toBeUndefined();

    // Bind repo to "figma" while local overrides theme to "light"
    const bound = bindRepoPreset("figma", customDir, globalConfigPath);
    expect(bound.boundPreset).toBe("figma");
    saveConfigDelta({ theme: "light" }, "local", customDir, null, globalConfigPath);

    const customMerged = loadMergedConfig(customDir, globalConfigPath);
    expect(customMerged.minimalModeByDefault).toBe(true); // from bound preset "figma"
    expect(customMerged.theme).toBe("light"); // explicit local override beats preset
    expect(customMerged.ports?.companion).toBe(7450); // global port preserved

    const listed = listPresets(customDir, globalConfigPath);
    expect(Object.keys(listed.presets).sort()).toEqual(["figma", "work"]);
    expect(listed.activePreset).toBe("figma");
    expect(listed.boundPreset).toBe("figma");
    expect(listed.effectivePreset).toBe("figma");

    // Clear repo binding
    const clearedBind = bindRepoPreset(null, customDir, globalConfigPath);
    expect(clearedBind.boundPreset).toBeNull();
    expect(listPresets(customDir, globalConfigPath).boundPreset).toBeNull();

    // Delete active preset clears activePreset and falls back to global base
    const deleted = deletePreset("figma", projectDir, globalConfigPath);
    expect(deleted.deleted).toBe(true);
    expect(deleted.clearedActive).toBe(true);
    expect(listPresets(projectDir, globalConfigPath).activePreset).toBeNull();
    expect(getRecentProjects(globalConfigPath)).toEqual([normalizeProjectPath(projectDir)]);

    // Unknown preset names in global/local files degrade gracefully
    fs.writeFileSync(
      path.join(customDir, ".hoversourcerc"),
      JSON.stringify({ preset: "does-not-exist", snappingThreshold: 22 }),
      "utf-8"
    );
    const unknownFallback = loadMergedConfig(customDir, globalConfigPath);
    expect(unknownFallback.snappingThreshold).toBe(22);
    expect(unknownFallback.theme).toBe("light"); // global base
  });

  it("rejects unsafe prototype keys, empty/whitespace preset names, and unknown usePreset", () => {
    for (const badName of ["", "   ", "__proto__", "constructor", "prototype"]) {
      expect(() => savePreset(badName, { theme: "light" }, projectDir, globalConfigPath)).toThrow(
        ConfigValidationError
      );
      expect(() => usePreset(badName, projectDir, globalConfigPath)).toThrow(ConfigValidationError);
      expect(() => deletePreset(badName, projectDir, globalConfigPath)).toThrow(ConfigValidationError);
      expect(() => bindRepoPreset(badName, projectDir, globalConfigPath)).toThrow(ConfigValidationError);
    }

    expect(() => usePreset("missing-preset", projectDir, globalConfigPath)).toThrow(ConfigValidationError);
    expect(deletePreset("missing-preset", projectDir, globalConfigPath).deleted).toBe(false);
  });

  it("supports include, ignore, and respectGitignore as repo-scoped scan config excluded from presets", () => {
    const base = loadMergedConfig(projectDir, globalConfigPath);
    expect(base.respectGitignore).toBe(true);
    expect(base.ignore).toEqual([]);
    expect(base.include).toBeUndefined();

    const parsedJson = buildDeltaFromKeyValue("include", '["src", "packages/ui/src"]');
    expect(parsedJson.ok).toBe(true);
    if (parsedJson.ok) {
      expect(parsedJson.value.include).toEqual(["src", "packages/ui/src"]);
    }

    const parsedCsv = buildDeltaFromKeyValue("ignore", ".scratch, *.gen.css");
    expect(parsedCsv.ok).toBe(true);
    if (parsedCsv.ok) {
      expect(parsedCsv.value.ignore).toEqual([".scratch", "*.gen.css"]);
    }

    const parsedFlag = buildDeltaFromKeyValue("respectGitignore", "false");
    expect(parsedFlag.ok).toBe(true);
    if (parsedFlag.ok) {
      expect(parsedFlag.value.respectGitignore).toBe(false);
    }

    expect(parseConfigDelta({ include: [""] }).ok).toBe(false);
    expect(parseConfigDelta({ ignore: "not-an-array" }).ok).toBe(false);
    expect(buildDeltaFromKeyValue("include", "[invalid").ok).toBe(false);

    saveConfigDelta(
      {
        theme: "light",
        include: ["src"],
        ignore: ["legacy/**"],
        respectGitignore: false,
      },
      "local",
      projectDir,
      null,
      globalConfigPath
    );

    const merged = loadMergedConfig(projectDir, globalConfigPath);
    expect(merged.include).toEqual(["src"]);
    expect(merged.ignore).toEqual(["legacy/**"]);
    expect(merged.respectGitignore).toBe(false);

    const snap = savePreset("scan-test", null, projectDir, globalConfigPath);
    expect(snap.preset.theme).toBe("light");
    expect((snap.preset as Record<string, unknown>).include).toBeUndefined();
    expect((snap.preset as Record<string, unknown>).ignore).toBeUndefined();
    expect((snap.preset as Record<string, unknown>).respectGitignore).toBeUndefined();

    // Global scan-scope keys must not leak into unrelated repos
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({
        theme: "light",
        include: ["only-global-dir"],
        ignore: ["secret/**"],
        respectGitignore: false,
      }),
      "utf-8"
    );
    const unrelatedMerged = loadMergedConfig(customDir, globalConfigPath);
    expect(unrelatedMerged.theme).toBe("light");
    expect(unrelatedMerged.include).toBeUndefined();
    expect(unrelatedMerged.ignore).toEqual([]);
    expect(unrelatedMerged.respectGitignore).toBe(true);
    expect(unrelatedMerged.schemaVersion).toBe(CURRENT_CONFIG_SCHEMA_VERSION);
  });

  it("migrates legacy v0 configs with backup-before-write and preserves newer future schemaVersion", () => {
    const legacyGlobal = {
      theme: "light",
      include: ["stale-global-include"],
      ignore: ["stale/**"],
      respectGitignore: false,
    };
    fs.writeFileSync(globalConfigPath, JSON.stringify(legacyGlobal), "utf-8");

    const loaded = loadMergedConfig(projectDir, globalConfigPath);
    expect(loaded.schemaVersion).toBe(CURRENT_CONFIG_SCHEMA_VERSION);
    expect(loaded.theme).toBe("light");
    expect(loaded.include).toBeUndefined();

    // Backup created before atomic rewrite
    const backupPath = `${globalConfigPath}.bak.v0`;
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(backupPath, "utf-8"))).toEqual(legacyGlobal);

    // Persisted file upgraded to schemaVersion 1 with misplaced global scan keys removed
    const migratedDisk = JSON.parse(fs.readFileSync(globalConfigPath, "utf-8"));
    expect(migratedDisk.schemaVersion).toBe(1);
    expect(migratedDisk.include).toBeUndefined();

    // Second migration pass is idempotent
    const secondPass = migrateConfigObject(migratedDisk, "global");
    expect(secondPass.changed).toBe(false);

    // Future schemaVersion is preserved without downgrading
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const futureConfig = { schemaVersion: 99, theme: "dark", futureField: "keep-me" };
    fs.writeFileSync(path.join(projectDir, ".hoversourcerc"), JSON.stringify(futureConfig), "utf-8");
    loadMergedConfig(projectDir, globalConfigPath);
    const persistedFuture = JSON.parse(fs.readFileSync(path.join(projectDir, ".hoversourcerc"), "utf-8"));
    expect(persistedFuture.schemaVersion).toBe(99);
    expect(persistedFuture.futureField).toBe("keep-me");
    expect(warnSpy).toHaveBeenCalled();
  });
});
