import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ShortcutKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

export type ShortcutConfig = ShortcutKey;

export interface LayerPickerScroll {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

export type ScrollModifiersConfig = LayerPickerScroll;

export type ConfigTheme = "dark" | "light" | "system";
export type ConfigEditor = "vscode" | "cursor" | "code";
export type ConfigTarget = "global" | "local" | "custom";
export type CompanionConflictPolicy = "shift" | "takeover" | "fail";

export interface PortsConfig {
  companion?: number;
  debug?: number;
  proxy?: number;
  dev?: number;
  companionConflict?: CompanionConflictPolicy;
}

export interface HoverSourceConfig {
  theme: ConfigTheme;
  minimalModeByDefault: boolean;
  editor: ConfigEditor;
  autoResolvePortConflicts?: boolean;
  layerPickerEnabled?: boolean;
  include?: string[];
  ignore?: string[];
  respectGitignore?: boolean;
  webAppDevServerTimeout?: number;
  snappingThreshold?: number;
  desnappingThreshold?: number;
  maxTraversalDepth?: number;
  layerPickerScroll?: LayerPickerScroll;
  ports?: PortsConfig;
  shortcuts: {
    toggleUI: ShortcutKey;
    toggleMinimal: ShortcutKey;
    toggleFreeze: ShortcutKey;
    copyMetadata: ShortcutKey;
    copyAllLayers: ShortcutKey;
    openDashboard: ShortcutKey;
    toggleMode: ShortcutKey;
    toggleFilterPanel: ShortcutKey;
  };
  metadataFilter?: {
    panelPosition?: { x: number; y: number };
    filters?: {
      component?: Record<string, boolean>;
      layer?: Record<string, boolean>;
      design?: Record<string, boolean>;
    };
  };
}

export interface PresetConfig {
  theme?: ConfigTheme;
  minimalModeByDefault?: boolean;
  snappingThreshold?: number;
  desnappingThreshold?: number;
  maxTraversalDepth?: number;
  layerPickerScroll?: Partial<LayerPickerScroll>;
  shortcuts?: Partial<Record<ShortcutAction, Partial<ShortcutKey>>>;
  metadataFilter?: {
    panelPosition?: { x?: number; y?: number };
    filters?: Partial<Record<FilterCategory, Record<string, boolean>>>;
  };
}

export interface PresetListResult {
  presets: Record<string, PresetConfig>;
  activePreset: string | null;
  boundPreset: string | null;
  effectivePreset: string | null;
}

export interface SavePresetResult {
  name: string;
  preset: PresetConfig;
  savedTo: string;
  presets: Record<string, PresetConfig>;
}

export interface UsePresetResult {
  activePreset: string | null;
  savedTo: string;
  config: HoverSourceConfig;
}

export interface DeletePresetResult {
  deleted: boolean;
  name: string;
  clearedActive: boolean;
  savedTo: string;
  config: HoverSourceConfig;
}

export interface BindRepoPresetResult {
  boundPreset: string | null;
  savedTo: string;
  config: HoverSourceConfig;
}

export type ShortcutAction = keyof HoverSourceConfig["shortcuts"];
export type FilterCategory = "component" | "layer" | "design";

export interface ConfigDelta {
  theme?: ConfigTheme;
  minimalModeByDefault?: boolean;
  editor?: ConfigEditor;
  autoResolvePortConflicts?: boolean;
  layerPickerEnabled?: boolean;
  include?: string[];
  ignore?: string[];
  respectGitignore?: boolean;
  webAppDevServerTimeout?: number;
  snappingThreshold?: number;
  desnappingThreshold?: number;
  maxTraversalDepth?: number;
  layerPickerScroll?: Partial<LayerPickerScroll>;
  ports?: {
    companion?: number;
    debug?: number;
    proxy?: number | null;
    dev?: number | null;
    companionConflict?: CompanionConflictPolicy;
  };
  shortcuts?: Partial<Record<ShortcutAction, Partial<ShortcutKey>>>;
  metadataFilter?: {
    panelPosition?: { x?: number; y?: number };
    filters?: Partial<Record<FilterCategory, Record<string, boolean>>>;
  };
}

export interface ConfigValidationIssue {
  path: string;
  message: string;
}

export type ParseConfigDeltaResult =
  | { ok: true; value: ConfigDelta }
  | { ok: false; error: string; issues: ConfigValidationIssue[] };

export class ConfigValidationError extends Error {
  public readonly issues: ConfigValidationIssue[];

  constructor(message: string, issues: ConfigValidationIssue[] = []) {
    super(message);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export interface SaveConfigResult {
  savedTo: string;
  config: HoverSourceConfig;
}

export interface DeleteConfigResult {
  deletedFile: boolean;
  removedRecent: boolean;
  newConfig: HoverSourceConfig;
}

export const DEFAULT_CONFIG: HoverSourceConfig = {
  theme: "dark",
  minimalModeByDefault: false,
  editor: "vscode",
  autoResolvePortConflicts: false,
  respectGitignore: true,
  ignore: [],
  webAppDevServerTimeout: 120,
  snappingThreshold: 15,
  desnappingThreshold: 15,
  maxTraversalDepth: 32,
  ports: {
    companion: 7300,
    debug: 9222,
    companionConflict: "shift",
  },
  shortcuts: {
    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true, metaKey: false },
    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFilterPanel: { key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false },
  },
  metadataFilter: {
    filters: {
      component: {
        componentName: true,
        elementSelector: true,
        filePath: true,
        framework: true,
        dimensions: true,
        keyStyles: true,
        parentStyles: true,
        layoutConstraints: true,
        sourceComments: true,
        sourceAttributes: true,
      },
      layer: {
        layerSummary: true,
        layer1: true,
        layer2: true,
        htmlStructure: true,
      },
      design: {
        compInfo: true,
        horizontalAnchor: true,
        verticalAnchor: true,
        layoutContext: true,
        suggestedCss: true,
        sourceFiles: true,
        aiInstructions: true,
      },
    },
  },
};

const VALID_THEMES = new Set<string>(["dark", "light", "system"]);
const VALID_EDITORS = new Set<string>(["vscode", "cursor", "code"]);
const VALID_SHORTCUT_ACTIONS = new Set<string>([
  "toggleUI",
  "toggleMinimal",
  "toggleFreeze",
  "copyMetadata",
  "copyAllLayers",
  "openDashboard",
  "toggleMode",
  "toggleFilterPanel",
]);
const VALID_SHORTCUT_FIELDS = new Set<string>(["key", "altKey", "ctrlKey", "shiftKey", "metaKey"]);
const VALID_SCROLL_FIELDS = new Set<string>(["altKey", "ctrlKey", "shiftKey", "metaKey"]);
const PRESET_SCOPED_KEYS = new Set<string>([
  "shortcuts",
  "layerPickerScroll",
  "theme",
  "metadataFilter",
  "minimalModeByDefault",
  "snappingThreshold",
  "desnappingThreshold",
  "maxTraversalDepth",
]);
const VALID_FILTER_CATEGORIES = new Set<string>(["component", "layer", "design"]);
const VALID_PORT_FIELDS = new Set<string>(["companion", "debug", "proxy", "dev", "companionConflict"]);
const VALID_CONFLICT_POLICIES = new Set<string>(["shift", "takeover", "fail"]);
const VALID_TOP_LEVEL_KEYS = new Set<string>([
  "theme",
  "minimalModeByDefault",
  "editor",
  "autoResolvePortConflicts",
  "layerPickerEnabled",
  "webAppDevServerTimeout",
  "snappingThreshold",
  "desnappingThreshold",
  "maxTraversalDepth",
  "layerPickerScroll",
  "ports",
  "shortcuts",
  "metadataFilter",
  "include",
  "ignore",
  "respectGitignore",
]);
const DISALLOWED_PROTO_KEYS = new Set<string>(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDefaultConfig(): HoverSourceConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export function getGlobalConfigPath(globalConfigPath?: string): string {
  return globalConfigPath ?? path.join(os.homedir(), ".hoversourcerc");
}

export function getLocalConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".hoversourcerc");
}

export function normalizeProjectPath(projectPath: string): string {
  let resolved = projectPath.replaceAll("\\", "/");
  if (!resolved.startsWith("/") && !/^[a-zA-Z]:/.test(resolved)) {
    resolved = path.resolve(projectPath).replaceAll("\\", "/");
  }
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved[0].toUpperCase() + resolved.slice(1);
  }
  return resolved;
}

export function mergeDeep<T = any>(target: any, source: any): T {
  if (
    typeof target !== "object" ||
    target === null ||
    Array.isArray(target) ||
    typeof source !== "object" ||
    source === null ||
    Array.isArray(source)
  ) {
    return source;
  }
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    if (DISALLOWED_PROTO_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      result[key] = mergeDeep(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result as T;
}

export function writeJsonAtomic(targetPath: string, data: unknown): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.hoversourcerc.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify(data, null, 2);

  let fd: number | undefined;
  try {
    fd = fs.openSync(tmpPath, "w");
    fs.writeFileSync(fd, payload, "utf-8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, targetPath);
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close failure during cleanup
      }
    }
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore unlink failure during cleanup
      }
    }
  }
}

function quarantineCorruptFile(filePath: string, error: SyntaxError): void {
  const backupPath = `${filePath}.corrupt.${Date.now()}`;
  try {
    fs.renameSync(filePath, backupPath);
    console.warn(`[HoverSource] Corrupt config JSON at ${filePath}; quarantined to ${backupPath}`, error);
  } catch (renameErr) {
    console.warn(`[HoverSource] Corrupt config JSON at ${filePath}; quarantine rename failed`, error, renameErr);
  }
}

function readConfigFromFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      console.warn(`[HoverSource] Expected JSON object in config file at ${filePath}`);
      return null;
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      quarantineCorruptFile(filePath, err);
    } else {
      console.warn(`[HoverSource] Failed to read config file at ${filePath}:`, err);
    }
    return null;
  }
}

function validateBoolean(
  value: unknown,
  fieldPath: string,
  issues: ConfigValidationIssue[]
): boolean | undefined {
  if (typeof value !== "boolean") {
    issues.push({ path: fieldPath, message: `${fieldPath} must be a boolean` });
    return undefined;
  }
  return value;
}

function validateIntRange(
  value: unknown,
  fieldPath: string,
  min: number,
  max: number,
  issues: ConfigValidationIssue[]
): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    const rangeLabel = max === Number.POSITIVE_INFINITY ? `>= ${min}` : `${min}..${max}`;
    issues.push({ path: fieldPath, message: `${fieldPath} must be an integer in ${rangeLabel}` });
    return undefined;
  }
  return value;
}

function validateStringArray(
  value: unknown,
  fieldPath: string,
  issues: ConfigValidationIssue[]
): string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path: fieldPath, message: `${fieldPath} must be an array of strings` });
    return undefined;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string" || item.trim().length === 0 || /[\r\n\0]/.test(item)) {
      issues.push({
        path: `${fieldPath}.${i}`,
        message: `${fieldPath}[${i}] must be a non-empty single-line string`,
      });
      continue;
    }
    out.push(item.trim());
  }
  return out;
}

function validateShortcutDelta(
  raw: unknown,
  basePath: string,
  issues: ConfigValidationIssue[]
): Partial<ShortcutKey> | undefined {
  if (!isPlainObject(raw)) {
    issues.push({ path: basePath, message: `${basePath} must be an object` });
    return undefined;
  }
  const out: Partial<ShortcutKey> = {};
  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || !VALID_SHORTCUT_FIELDS.has(key)) {
      issues.push({ path: `${basePath}.${key}`, message: `Unknown shortcut field: ${basePath}.${key}` });
      continue;
    }
    const val = raw[key];
    if (key === "key") {
      if (typeof val !== "string") {
        issues.push({ path: `${basePath}.key`, message: `${basePath}.key must be a string` });
      } else {
        out.key = val;
      }
    } else if (key === "altKey" || key === "ctrlKey" || key === "shiftKey" || key === "metaKey") {
      const parsed = validateBoolean(val, `${basePath}.${key}`, issues);
      if (parsed !== undefined) {
        out[key] = parsed;
      }
    }
  }
  return out;
}

function validateScrollDelta(
  raw: unknown,
  issues: ConfigValidationIssue[]
): Partial<LayerPickerScroll> | undefined {
  if (!isPlainObject(raw)) {
    issues.push({ path: "layerPickerScroll", message: "layerPickerScroll must be an object" });
    return undefined;
  }
  const out: Partial<LayerPickerScroll> = {};
  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || !VALID_SCROLL_FIELDS.has(key)) {
      issues.push({
        path: `layerPickerScroll.${key}`,
        message: `Unknown layerPickerScroll field: layerPickerScroll.${key}`,
      });
      continue;
    }
    const parsed = validateBoolean(raw[key], `layerPickerScroll.${key}`, issues);
    if (parsed !== undefined && (key === "altKey" || key === "ctrlKey" || key === "shiftKey" || key === "metaKey")) {
      out[key] = parsed;
    }
  }
  return out;
}

function validateMetadataFilterDelta(
  raw: unknown,
  issues: ConfigValidationIssue[]
): ConfigDelta["metadataFilter"] | undefined {
  if (!isPlainObject(raw)) {
    issues.push({ path: "metadataFilter", message: "metadataFilter must be an object" });
    return undefined;
  }
  const out: NonNullable<ConfigDelta["metadataFilter"]> = {};
  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || (key !== "panelPosition" && key !== "filters")) {
      issues.push({ path: `metadataFilter.${key}`, message: `Unknown metadataFilter field: metadataFilter.${key}` });
      continue;
    }
    if (key === "panelPosition") {
      const pos = raw.panelPosition;
      if (!isPlainObject(pos)) {
        issues.push({ path: "metadataFilter.panelPosition", message: "metadataFilter.panelPosition must be an object" });
        continue;
      }
      const outPos: { x?: number; y?: number } = {};
      for (const coord of Object.keys(pos)) {
        if (DISALLOWED_PROTO_KEYS.has(coord) || (coord !== "x" && coord !== "y")) {
          issues.push({
            path: `metadataFilter.panelPosition.${coord}`,
            message: `Unknown panelPosition field: metadataFilter.panelPosition.${coord}`,
          });
          continue;
        }
        const coordVal = pos[coord];
        if (typeof coordVal !== "number" || !Number.isFinite(coordVal)) {
          issues.push({
            path: `metadataFilter.panelPosition.${coord}`,
            message: `metadataFilter.panelPosition.${coord} must be a finite number`,
          });
        } else {
          outPos[coord] = coordVal;
        }
      }
      out.panelPosition = outPos;
    } else if (key === "filters") {
      const filters = raw.filters;
      if (!isPlainObject(filters)) {
        issues.push({ path: "metadataFilter.filters", message: "metadataFilter.filters must be an object" });
        continue;
      }
      const outFilters: Partial<Record<FilterCategory, Record<string, boolean>>> = {};
      for (const category of Object.keys(filters)) {
        if (DISALLOWED_PROTO_KEYS.has(category) || !VALID_FILTER_CATEGORIES.has(category)) {
          issues.push({
            path: `metadataFilter.filters.${category}`,
            message: `Unknown metadataFilter category: metadataFilter.filters.${category}`,
          });
          continue;
        }
        const catObj = filters[category];
        if (!isPlainObject(catObj)) {
          issues.push({
            path: `metadataFilter.filters.${category}`,
            message: `metadataFilter.filters.${category} must be an object`,
          });
          continue;
        }
        const outCat: Record<string, boolean> = {};
        for (const field of Object.keys(catObj)) {
          if (DISALLOWED_PROTO_KEYS.has(field)) {
            issues.push({
              path: `metadataFilter.filters.${category}.${field}`,
              message: `Invalid filter key: ${field}`,
            });
            continue;
          }
          const parsedBool = validateBoolean(
            catObj[field],
            `metadataFilter.filters.${category}.${field}`,
            issues
          );
          if (parsedBool !== undefined) {
            outCat[field] = parsedBool;
          }
        }
        outFilters[category as FilterCategory] = outCat;
      }
      out.filters = outFilters;
    }
  }
  return out;
}

function validatePortsDelta(
  raw: unknown,
  issues: ConfigValidationIssue[]
): ConfigDelta["ports"] | undefined {
  if (!isPlainObject(raw)) {
    issues.push({ path: "ports", message: "ports must be an object" });
    return undefined;
  }
  const out: NonNullable<ConfigDelta["ports"]> = {};
  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || !VALID_PORT_FIELDS.has(key)) {
      issues.push({ path: `ports.${key}`, message: `Unknown ports field: ports.${key}` });
      continue;
    }
    const val = raw[key];
    if (key === "companion" || key === "debug") {
      const n = validateIntRange(val, `ports.${key}`, 1, 65535, issues);
      if (n !== undefined) {
        out[key] = n;
      }
    } else if (key === "proxy" || key === "dev") {
      if (val === null) {
        out[key] = null;
      } else {
        const n = validateIntRange(val, `ports.${key}`, 1, 65535, issues);
        if (n !== undefined) {
          out[key] = n;
        }
      }
    } else if (key === "companionConflict") {
      if (typeof val !== "string" || !VALID_CONFLICT_POLICIES.has(val)) {
        issues.push({
          path: "ports.companionConflict",
          message: 'ports.companionConflict must be one of "shift", "takeover", "fail"',
        });
      } else {
        out.companionConflict = val as CompanionConflictPolicy;
      }
    }
  }
  return out;
}

export function parseConfigDelta(raw: unknown): ParseConfigDeltaResult {
  if (!isPlainObject(raw)) {
    const issue: ConfigValidationIssue = { path: "", message: "Config delta must be a JSON object" };
    return { ok: false, error: issue.message, issues: [issue] };
  }

  const issues: ConfigValidationIssue[] = [];
  const parsed: ConfigDelta = {};

  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || !VALID_TOP_LEVEL_KEYS.has(key)) {
      issues.push({ path: key, message: `Unknown config key: ${key}` });
      continue;
    }

    const val = raw[key];
    switch (key) {
      case "theme":
        if (typeof val !== "string" || !VALID_THEMES.has(val)) {
          issues.push({ path: "theme", message: 'theme must be one of "dark", "light", "system"' });
        } else {
          parsed.theme = val as ConfigTheme;
        }
        break;
      case "editor":
        if (typeof val !== "string" || !VALID_EDITORS.has(val)) {
          issues.push({ path: "editor", message: 'editor must be one of "vscode", "cursor", "code"' });
        } else {
          parsed.editor = val as ConfigEditor;
        }
        break;
      case "minimalModeByDefault": {
        const b = validateBoolean(val, "minimalModeByDefault", issues);
        if (b !== undefined) parsed.minimalModeByDefault = b;
        break;
      }
      case "autoResolvePortConflicts": {
        const b = validateBoolean(val, "autoResolvePortConflicts", issues);
        if (b !== undefined) parsed.autoResolvePortConflicts = b;
        break;
      }
      case "layerPickerEnabled": {
        const b = validateBoolean(val, "layerPickerEnabled", issues);
        if (b !== undefined) parsed.layerPickerEnabled = b;
        break;
      }
      case "snappingThreshold": {
        const n = validateIntRange(val, "snappingThreshold", 0, 100, issues);
        if (n !== undefined) parsed.snappingThreshold = n;
        break;
      }
      case "desnappingThreshold": {
        const n = validateIntRange(val, "desnappingThreshold", 0, 100, issues);
        if (n !== undefined) parsed.desnappingThreshold = n;
        break;
      }
      case "maxTraversalDepth": {
        const n = validateIntRange(val, "maxTraversalDepth", 8, 100, issues);
        if (n !== undefined) parsed.maxTraversalDepth = n;
        break;
      }
      case "webAppDevServerTimeout": {
        const n = validateIntRange(val, "webAppDevServerTimeout", 1, Number.POSITIVE_INFINITY, issues);
        if (n !== undefined) parsed.webAppDevServerTimeout = n;
        break;
      }
      case "layerPickerScroll": {
        const scroll = validateScrollDelta(val, issues);
        if (scroll !== undefined) parsed.layerPickerScroll = scroll;
        break;
      }
      case "ports": {
        const ports = validatePortsDelta(val, issues);
        if (ports !== undefined) parsed.ports = ports;
        break;
      }
      case "shortcuts": {
        if (!isPlainObject(val)) {
          issues.push({ path: "shortcuts", message: "shortcuts must be an object" });
          break;
        }
        const outShortcuts: Partial<Record<ShortcutAction, Partial<ShortcutKey>>> = {};
        for (const action of Object.keys(val)) {
          if (DISALLOWED_PROTO_KEYS.has(action) || !VALID_SHORTCUT_ACTIONS.has(action)) {
            issues.push({ path: `shortcuts.${action}`, message: `Unknown shortcut action: shortcuts.${action}` });
            continue;
          }
          const validated = validateShortcutDelta(val[action], `shortcuts.${action}`, issues);
          if (validated !== undefined) {
            outShortcuts[action as ShortcutAction] = validated;
          }
        }
        parsed.shortcuts = outShortcuts;
        break;
      }
      case "metadataFilter": {
        const mf = validateMetadataFilterDelta(val, issues);
        if (mf !== undefined) parsed.metadataFilter = mf;
        break;
      }
      case "include": {
        const includeList = validateStringArray(val, "include", issues);
        if (includeList !== undefined) parsed.include = includeList;
        break;
      }
      case "ignore": {
        const ignoreList = validateStringArray(val, "ignore", issues);
        if (ignoreList !== undefined) parsed.ignore = ignoreList;
        break;
      }
      case "respectGitignore": {
        const b = validateBoolean(val, "respectGitignore", issues);
        if (b !== undefined) parsed.respectGitignore = b;
        break;
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: issues.map((i) => i.message).join("; "),
      issues,
    };
  }

  return { ok: true, value: parsed };
}

export function getConfigValueByPath(config: HoverSourceConfig, keyPath: string): unknown {
  if (!keyPath || keyPath.trim() === "") {
    return undefined;
  }
  const segments = keyPath.split(".");
  if (segments.some((s) => s.length === 0 || DISALLOWED_PROTO_KEYS.has(s))) {
    return undefined;
  }

  let current: unknown = config;
  for (const segment of segments) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function parseStrictBoolean(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function parseStrictInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseStrictNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function failKeyValue(keyPath: string, message: string): ParseConfigDeltaResult {
  return { ok: false, error: message, issues: [{ path: keyPath, message }] };
}

export function buildDeltaFromKeyValue(keyPath: string, rawValue: string): ParseConfigDeltaResult {
  if (!keyPath || keyPath.trim() === "") {
    return failKeyValue(keyPath, "Config key path must not be empty");
  }
  const segments = keyPath.split(".");
  if (segments.some((s) => s.length === 0 || DISALLOWED_PROTO_KEYS.has(s))) {
    return failKeyValue(keyPath, `Invalid config key path: ${keyPath}`);
  }

  if (segments.length === 1) {
    const key = segments[0];
    if (key === "theme" || key === "editor") {
      return parseConfigDelta({ [key]: rawValue });
    }
    if (
      key === "minimalModeByDefault" ||
      key === "autoResolvePortConflicts" ||
      key === "layerPickerEnabled" ||
      key === "respectGitignore"
    ) {
      const boolVal = parseStrictBoolean(rawValue);
      if (boolVal === null) {
        return failKeyValue(keyPath, `Invalid boolean value "${rawValue}" for ${keyPath}; expected "true" or "false"`);
      }
      return parseConfigDelta({ [key]: boolVal });
    }
    if (key === "include" || key === "ignore") {
      const trimmed = rawValue.trim();
      let listVal: unknown;
      if (trimmed.startsWith("[")) {
        try {
          listVal = JSON.parse(trimmed);
        } catch {
          return failKeyValue(keyPath, `Invalid JSON array "${rawValue}" for ${keyPath}`);
        }
      } else {
        listVal = trimmed === "" ? [] : trimmed.split(",").map((item) => item.trim());
      }
      return parseConfigDelta({ [key]: listVal });
    }
    if (
      key === "snappingThreshold" ||
      key === "desnappingThreshold" ||
      key === "maxTraversalDepth" ||
      key === "webAppDevServerTimeout"
    ) {
      const intVal = parseStrictInteger(rawValue);
      if (intVal === null) {
        return failKeyValue(keyPath, `Invalid integer value "${rawValue}" for ${keyPath}`);
      }
      return parseConfigDelta({ [key]: intVal });
    }
    return failKeyValue(keyPath, `Unknown config key: ${keyPath}`);
  }

  if (segments[0] === "shortcuts" && segments.length === 3) {
    const [, action, prop] = segments;
    if (!VALID_SHORTCUT_ACTIONS.has(action) || !VALID_SHORTCUT_FIELDS.has(prop)) {
      return failKeyValue(keyPath, `Unknown config key: ${keyPath}`);
    }
    if (prop === "key") {
      return parseConfigDelta({ shortcuts: { [action]: { key: rawValue } } });
    }
    const boolVal = parseStrictBoolean(rawValue);
    if (boolVal === null) {
      return failKeyValue(keyPath, `Invalid boolean value "${rawValue}" for ${keyPath}; expected "true" or "false"`);
    }
    return parseConfigDelta({ shortcuts: { [action]: { [prop]: boolVal } } });
  }

  if (segments[0] === "layerPickerScroll" && segments.length === 2) {
    const prop = segments[1];
    if (!VALID_SCROLL_FIELDS.has(prop)) {
      return failKeyValue(keyPath, `Unknown config key: ${keyPath}`);
    }
    const boolVal = parseStrictBoolean(rawValue);
    if (boolVal === null) {
      return failKeyValue(keyPath, `Invalid boolean value "${rawValue}" for ${keyPath}; expected "true" or "false"`);
    }
    return parseConfigDelta({ layerPickerScroll: { [prop]: boolVal } });
  }

  if (segments[0] === "ports" && segments.length === 2) {
    const field = segments[1];
    if (!VALID_PORT_FIELDS.has(field)) {
      return failKeyValue(keyPath, `Unknown config key: ${keyPath}`);
    }
    if (field === "companionConflict") {
      return parseConfigDelta({ ports: { companionConflict: rawValue } });
    }
    if (field === "proxy" || field === "dev") {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === "null" || normalized === "auto") {
        return parseConfigDelta({ ports: { [field]: null } });
      }
    }
    const intVal = parseStrictInteger(rawValue);
    if (intVal === null) {
      return failKeyValue(keyPath, `Invalid integer value "${rawValue}" for ${keyPath}`);
    }
    return parseConfigDelta({ ports: { [field]: intVal } });
  }

  if (segments[0] === "metadataFilter") {
    if (segments.length === 3 && segments[1] === "panelPosition" && (segments[2] === "x" || segments[2] === "y")) {
      const numVal = parseStrictNumber(rawValue);
      if (numVal === null) {
        return failKeyValue(keyPath, `Invalid numeric value "${rawValue}" for ${keyPath}`);
      }
      return parseConfigDelta({ metadataFilter: { panelPosition: { [segments[2]]: numVal } } });
    }
    if (segments.length === 4 && segments[1] === "filters" && VALID_FILTER_CATEGORIES.has(segments[2])) {
      const boolVal = parseStrictBoolean(rawValue);
      if (boolVal === null) {
        return failKeyValue(keyPath, `Invalid boolean value "${rawValue}" for ${keyPath}; expected "true" or "false"`);
      }
      return parseConfigDelta({
        metadataFilter: {
          filters: {
            [segments[2]]: {
              [segments[3]]: boolVal,
            },
          },
        },
      });
    }
  }

  return failKeyValue(keyPath, `Unknown config key: ${keyPath}`);
}

export function registerRecentProject(projectRoot: string, globalConfigPath?: string): void {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalData = readConfigFromFile(globalPath) ?? {};

  const existingList = Array.isArray(globalData.recentProjects) ? globalData.recentProjects : [];
  const normalized = normalizeProjectPath(projectRoot);

  const cleaned: string[] = [];
  for (const p of existingList) {
    if (typeof p !== "string") continue;
    const norm = normalizeProjectPath(p);
    if (!cleaned.includes(norm)) {
      cleaned.push(norm);
    }
  }

  if (!cleaned.includes(normalized)) {
    cleaned.push(normalized);
    if (cleaned.length > 10) {
      cleaned.shift();
    }
  }

  globalData.recentProjects = cleaned;

  try {
    writeJsonAtomic(globalPath, globalData);
  } catch (e) {
    console.warn("[HoverSource] Failed to save project history to global config", e);
  }
}

export function getRecentProjects(globalConfigPath?: string): string[] {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalData = readConfigFromFile(globalPath);
  if (!globalData || !Array.isArray(globalData.recentProjects)) {
    return [];
  }
  const cleaned: string[] = [];
  for (const p of globalData.recentProjects) {
    if (typeof p !== "string") continue;
    const norm = normalizeProjectPath(p);
    if (!cleaned.includes(norm)) {
      cleaned.push(norm);
    }
  }
  return cleaned;
}

function stripNullPortOverrides(container: Record<string, unknown>): void {
  if (isPlainObject(container.ports)) {
    if (container.ports.proxy === null) {
      delete container.ports.proxy;
    }
    if (container.ports.dev === null) {
      delete container.ports.dev;
    }
  }
}

function stripNonRuntimeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...raw };
  delete sanitized.recentProjects;
  delete sanitized.presets;
  delete sanitized.activePreset;
  delete sanitized.preset;
  return sanitized;
}

function readValidPresetName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || DISALLOWED_PROTO_KEYS.has(trimmed)) {
    return null;
  }
  return trimmed;
}

export function validatePresetName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ConfigValidationError("Preset name must be a string", [
      { path: "preset", message: "Preset name must be a string" },
    ]);
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ConfigValidationError("Preset name must not be empty", [
      { path: "preset", message: "Preset name must not be empty" },
    ]);
  }
  if (DISALLOWED_PROTO_KEYS.has(trimmed)) {
    throw new ConfigValidationError(`Invalid preset name: ${trimmed}`, [
      { path: "preset", message: `Invalid preset name: ${trimmed}` },
    ]);
  }
  return trimmed;
}

function extractPresetFields(raw: Record<string, unknown>): PresetConfig {
  const extracted: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (DISALLOWED_PROTO_KEYS.has(key) || !PRESET_SCOPED_KEYS.has(key)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      extracted[key] = structuredClone(raw[key]);
    }
  }
  return extracted as PresetConfig;
}

function readPresetsMap(globalRaw: Record<string, unknown> | null): Record<string, PresetConfig> {
  const result: Record<string, PresetConfig> = {};
  if (!globalRaw || !isPlainObject(globalRaw.presets)) {
    return result;
  }
  const rawPresets = globalRaw.presets;
  for (const key of Object.keys(rawPresets)) {
    const validName = readValidPresetName(key);
    if (!validName) {
      continue;
    }
    const candidate = rawPresets[key];
    if (!isPlainObject(candidate)) {
      continue;
    }
    result[validName] = extractPresetFields(candidate);
  }
  return result;
}

export function loadMergedConfig(projectRoot: string, globalConfigPath?: string): HoverSourceConfig {
  let config = cloneDefaultConfig();

  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalConfig = readConfigFromFile(globalPath);
  if (globalConfig) {
    config = mergeDeep<HoverSourceConfig>(config, stripNonRuntimeKeys(globalConfig));
  }

  const localPath = getLocalConfigPath(projectRoot);
  const localConfig = readConfigFromFile(localPath);

  const localPresetName = readValidPresetName(localConfig?.preset);
  const globalActivePresetName = readValidPresetName(globalConfig?.activePreset);
  const resolvedPresetName = localPresetName ?? globalActivePresetName;

  if (resolvedPresetName && globalConfig) {
    const presetsMap = readPresetsMap(globalConfig);
    if (Object.prototype.hasOwnProperty.call(presetsMap, resolvedPresetName)) {
      config = mergeDeep<HoverSourceConfig>(config, presetsMap[resolvedPresetName]);
    }
  }

  if (localConfig) {
    config = mergeDeep<HoverSourceConfig>(config, stripNonRuntimeKeys(localConfig));
  }

  stripNullPortOverrides(config as unknown as Record<string, unknown>);
  return config;
}

export function getConfigForTarget(
  queryTarget: string | null,
  customPath: string | null,
  defaultRoot: string,
  globalConfigPath?: string
): HoverSourceConfig {
  let targetConfig = cloneDefaultConfig();
  if (queryTarget === "global") {
    const globalPath = getGlobalConfigPath(globalConfigPath);
    const raw = readConfigFromFile(globalPath);
    if (raw) {
      targetConfig = mergeDeep<HoverSourceConfig>(targetConfig, stripNonRuntimeKeys(raw));
    }
  } else if (queryTarget === "local") {
    const localPath = getLocalConfigPath(defaultRoot);
    const raw = readConfigFromFile(localPath);
    if (raw) {
      targetConfig = mergeDeep<HoverSourceConfig>(targetConfig, stripNonRuntimeKeys(raw));
    }
  } else if (queryTarget === "custom" && customPath) {
    const customPathConfig = getLocalConfigPath(customPath);
    const raw = readConfigFromFile(customPathConfig);
    if (raw) {
      targetConfig = mergeDeep<HoverSourceConfig>(targetConfig, stripNonRuntimeKeys(raw));
    }
  } else {
    targetConfig = loadMergedConfig(defaultRoot, globalConfigPath);
  }
  stripNullPortOverrides(targetConfig as unknown as Record<string, unknown>);
  return targetConfig;
}

function resolveTargetConfigPath(
  target: ConfigTarget,
  projectRoot: string,
  customPath?: string | null,
  globalConfigPath?: string
): string {
  if (target === "global") {
    return getGlobalConfigPath(globalConfigPath);
  }
  if (target === "local") {
    return getLocalConfigPath(projectRoot);
  }
  if (target === "custom" && customPath) {
    return getLocalConfigPath(customPath);
  }
  throw new Error("Invalid target or missing customPath");
}

export function saveConfigDelta(
  rawDelta: unknown,
  target: ConfigTarget,
  projectRoot: string,
  customPath?: string | null,
  globalConfigPath?: string
): SaveConfigResult {
  const parsed = parseConfigDelta(rawDelta);
  if (!parsed.ok) {
    throw new ConfigValidationError(parsed.error, parsed.issues);
  }

  const targetPath = resolveTargetConfigPath(target, projectRoot, customPath, globalConfigPath);
  if (target === "custom" && customPath) {
    registerRecentProject(customPath, globalConfigPath);
  }

  const existing = readConfigFromFile(targetPath) ?? {};
  const mergedTarget = mergeDeep<Record<string, unknown>>(existing, parsed.value);
  stripNullPortOverrides(mergedTarget);

  if (target === "global" && Array.isArray(existing.recentProjects)) {
    mergedTarget.recentProjects = existing.recentProjects;
  }

  writeJsonAtomic(targetPath, mergedTarget);

  const fullyMerged = loadMergedConfig(projectRoot, globalConfigPath);
  return { savedTo: targetPath, config: fullyMerged };
}

export function resetConfigTarget(
  target: ConfigTarget,
  projectRoot: string,
  customPath?: string | null,
  globalConfigPath?: string
): SaveConfigResult {
  const targetPath = resolveTargetConfigPath(target, projectRoot, customPath, globalConfigPath);
  const resetPayload: Record<string, unknown> = cloneDefaultConfig() as unknown as Record<string, unknown>;

  if (target === "global") {
    const existing = readConfigFromFile(targetPath);
    if (existing && Array.isArray(existing.recentProjects)) {
      resetPayload.recentProjects = existing.recentProjects;
    }
  }

  writeJsonAtomic(targetPath, resetPayload);

  const fullyMerged = loadMergedConfig(projectRoot, globalConfigPath);
  return { savedTo: targetPath, config: fullyMerged };
}

function updateRecentProjectsOnDelete(
  globalPath: string,
  target: ConfigTarget,
  customPath: string | null | undefined,
  localProjectRoot: string
): void {
  const globalData = readConfigFromFile(globalPath);
  if (!globalData || !Array.isArray(globalData.recentProjects)) {
    return;
  }

  const pathToRemove = target === "local" ? localProjectRoot : customPath || "";
  const normalized = normalizeProjectPath(pathToRemove);
  globalData.recentProjects = globalData.recentProjects
    .filter((p): p is string => typeof p === "string")
    .map((p) => normalizeProjectPath(p))
    .filter((p) => p !== normalized);

  try {
    writeJsonAtomic(globalPath, globalData);
  } catch (e) {
    console.warn("[HoverSource] Failed to update recent list on config delete", e);
  }
}

export function deleteConfigTarget(
  target: ConfigTarget,
  projectRoot: string,
  customPath?: string | null,
  removeRecent = false,
  globalConfigPath?: string
): DeleteConfigResult {
  const targetPath = resolveTargetConfigPath(target, projectRoot, customPath, globalConfigPath);

  let deletedFile = false;
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    deletedFile = true;
  }

  const shouldRemoveRecent = target !== "global" && (removeRecent || target === "custom");
  if (shouldRemoveRecent) {
    const globalPath = getGlobalConfigPath(globalConfigPath);
    updateRecentProjectsOnDelete(globalPath, target, customPath, projectRoot);
  }

  const newConfig = loadMergedConfig(projectRoot, globalConfigPath);
  return {
    deletedFile,
    removedRecent: shouldRemoveRecent,
    newConfig,
  };
}

export function listPresets(projectRoot?: string, globalConfigPath?: string): PresetListResult {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalRaw = readConfigFromFile(globalPath);
  const presets = readPresetsMap(globalRaw);
  const activePreset = readValidPresetName(globalRaw?.activePreset);

  let boundPreset: string | null = null;
  if (projectRoot) {
    const localRaw = readConfigFromFile(getLocalConfigPath(projectRoot));
    boundPreset = readValidPresetName(localRaw?.preset);
  }

  return {
    presets,
    activePreset,
    boundPreset,
    effectivePreset: boundPreset ?? activePreset,
  };
}

export function savePreset(
  name: string,
  presetData: PresetConfig | null | undefined,
  projectRoot: string,
  globalConfigPath?: string
): SavePresetResult {
  const validatedName = validatePresetName(name);
  let normalizedPreset: PresetConfig;

  if (presetData === null || presetData === undefined) {
    const merged = loadMergedConfig(projectRoot, globalConfigPath);
    normalizedPreset = extractPresetFields(merged as unknown as Record<string, unknown>);
  } else {
    if (!isPlainObject(presetData)) {
      throw new ConfigValidationError("Preset config must be an object", [
        { path: "preset", message: "Preset config must be an object" },
      ]);
    }
    const filtered = extractPresetFields(presetData);
    const parsed = parseConfigDelta(filtered);
    if (!parsed.ok) {
      throw new ConfigValidationError(parsed.error, parsed.issues);
    }
    normalizedPreset = structuredClone(parsed.value) as PresetConfig;
  }

  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalRaw = readConfigFromFile(globalPath) ?? {};
  const presets = readPresetsMap(globalRaw);
  presets[validatedName] = normalizedPreset;
  globalRaw.presets = presets;

  writeJsonAtomic(globalPath, globalRaw);

  return {
    name: validatedName,
    preset: normalizedPreset,
    savedTo: globalPath,
    presets,
  };
}

export function usePreset(
  name: string | null,
  projectRoot: string,
  globalConfigPath?: string
): UsePresetResult {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalRaw = readConfigFromFile(globalPath) ?? {};

  if (name === null) {
    delete globalRaw.activePreset;
    writeJsonAtomic(globalPath, globalRaw);
    return {
      activePreset: null,
      savedTo: globalPath,
      config: loadMergedConfig(projectRoot, globalConfigPath),
    };
  }

  const validatedName = validatePresetName(name);
  const presets = readPresetsMap(globalRaw);
  if (!Object.prototype.hasOwnProperty.call(presets, validatedName)) {
    throw new ConfigValidationError(`Unknown preset "${validatedName}"`, [
      { path: "activePreset", message: `Unknown preset "${validatedName}"` },
    ]);
  }

  globalRaw.activePreset = validatedName;
  writeJsonAtomic(globalPath, globalRaw);

  return {
    activePreset: validatedName,
    savedTo: globalPath,
    config: loadMergedConfig(projectRoot, globalConfigPath),
  };
}

export function deletePreset(
  name: string,
  projectRoot: string,
  globalConfigPath?: string
): DeletePresetResult {
  const validatedName = validatePresetName(name);
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalRaw = readConfigFromFile(globalPath);
  const presets = readPresetsMap(globalRaw);

  if (!globalRaw || !Object.prototype.hasOwnProperty.call(presets, validatedName)) {
    return {
      deleted: false,
      name: validatedName,
      clearedActive: false,
      savedTo: globalPath,
      config: loadMergedConfig(projectRoot, globalConfigPath),
    };
  }

  delete presets[validatedName];
  globalRaw.presets = presets;

  let clearedActive = false;
  if (readValidPresetName(globalRaw.activePreset) === validatedName) {
    delete globalRaw.activePreset;
    clearedActive = true;
  }

  writeJsonAtomic(globalPath, globalRaw);

  return {
    deleted: true,
    name: validatedName,
    clearedActive,
    savedTo: globalPath,
    config: loadMergedConfig(projectRoot, globalConfigPath),
  };
}

export function bindRepoPreset(
  presetName: string | null,
  projectRoot: string,
  globalConfigPath?: string
): BindRepoPresetResult {
  const localPath = getLocalConfigPath(projectRoot);

  if (presetName === null) {
    const localRaw = readConfigFromFile(localPath);
    if (localRaw && Object.prototype.hasOwnProperty.call(localRaw, "preset")) {
      delete localRaw.preset;
      writeJsonAtomic(localPath, localRaw);
    }
    return {
      boundPreset: null,
      savedTo: localPath,
      config: loadMergedConfig(projectRoot, globalConfigPath),
    };
  }

  const validatedName = validatePresetName(presetName);
  const localRaw = readConfigFromFile(localPath) ?? {};
  localRaw.preset = validatedName;
  writeJsonAtomic(localPath, localRaw);

  return {
    boundPreset: validatedName,
    savedTo: localPath,
    config: loadMergedConfig(projectRoot, globalConfigPath),
  };
}
