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

export const CURRENT_CONFIG_SCHEMA_VERSION = 2;
export const DEFAULT_METADATA_FILTER_PRESET = "source-locate";

export interface MetadataFilterMap {
  component: Record<string, boolean>;
  layer: Record<string, boolean>;
  design: Record<string, boolean>;
}

export type MetadataFilterPresetPayload = Partial<Record<FilterCategory, Record<string, boolean>>>;
export type MetadataFilterPresetSource = "builtin" | "global" | "local";

export interface FilterPresetListResult {
  presets: Record<string, MetadataFilterMap>;
  sources: Record<string, MetadataFilterPresetSource>;
  builtinNames: string[];
  globalNames: string[];
  localNames: string[];
  activePreset: string;
  globalPreset: string | null;
  localPreset: string | null;
  filters: MetadataFilterMap;
}

export interface SaveFilterPresetResult {
  name: string;
  scope: "local" | "global";
  filters: MetadataFilterMap;
  savedTo: string;
  list: FilterPresetListResult;
}

export interface UseFilterPresetResult {
  activePreset: string | null;
  scope: "local" | "global";
  savedTo: string;
  config: HoverSourceConfig;
  list: FilterPresetListResult;
}

export interface DeleteFilterPresetResult {
  deleted: boolean;
  name: string;
  scope: "local" | "global";
  revertedTo: MetadataFilterPresetSource | null;
  clearedActive: boolean;
  savedTo: string;
  config: HoverSourceConfig;
  list: FilterPresetListResult;
}

export interface HoverSourceConfig {
  schemaVersion?: number;
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
    preset?: string;
    presets?: Record<string, MetadataFilterPresetPayload>;
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
    preset?: string;
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
    preset?: string;
    presets?: Record<string, MetadataFilterPresetPayload>;
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

const FULL_METADATA_FILTERS: MetadataFilterMap = {
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
};

export const BUILTIN_METADATA_FILTER_PRESETS: Record<string, MetadataFilterMap> = {
  full: structuredClone(FULL_METADATA_FILTERS),
  "source-locate": {
    component: {
      componentName: true,
      elementSelector: true,
      filePath: true,
      framework: true,
      dimensions: false,
      keyStyles: false,
      parentStyles: false,
      layoutConstraints: false,
      sourceComments: false,
      sourceAttributes: false,
    },
    layer: {
      layerSummary: true,
      layer1: true,
      layer2: false,
      htmlStructure: false,
    },
    design: {
      compInfo: true,
      horizontalAnchor: false,
      verticalAnchor: false,
      layoutContext: false,
      suggestedCss: false,
      sourceFiles: true,
      aiInstructions: false,
    },
  },
  "layout-styles": {
    component: {
      componentName: true,
      elementSelector: true,
      filePath: true,
      framework: false,
      dimensions: true,
      keyStyles: true,
      parentStyles: true,
      layoutConstraints: true,
      sourceComments: false,
      sourceAttributes: false,
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
      sourceFiles: false,
      aiInstructions: false,
    },
  },
  minimal: {
    component: {
      componentName: true,
      elementSelector: true,
      filePath: true,
      framework: false,
      dimensions: false,
      keyStyles: false,
      parentStyles: false,
      layoutConstraints: false,
      sourceComments: false,
      sourceAttributes: false,
    },
    layer: {
      layerSummary: true,
      layer1: false,
      layer2: false,
      htmlStructure: false,
    },
    design: {
      compInfo: true,
      horizontalAnchor: false,
      verticalAnchor: false,
      layoutContext: false,
      suggestedCss: false,
      sourceFiles: true,
      aiInstructions: false,
    },
  },
};

export const DEFAULT_CONFIG: HoverSourceConfig = {
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
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
    preset: DEFAULT_METADATA_FILTER_PRESET,
    filters: structuredClone(BUILTIN_METADATA_FILTER_PRESETS[DEFAULT_METADATA_FILTER_PRESET]),
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

export function isSameConfigFilePath(a: string, b: string): boolean {
  let normA = path.resolve(a);
  let normB = path.resolve(b);
  try {
    if (fs.existsSync(normA)) normA = fs.realpathSync.native(normA);
  } catch {
    // Fall back to path.resolve when realpath lookup fails
  }
  try {
    if (fs.existsSync(normB)) normB = fs.realpathSync.native(normB);
  } catch {
    // Fall back to path.resolve when realpath lookup fails
  }
  return process.platform === "win32" ? normA.toLowerCase() === normB.toLowerCase() : normA === normB;
}

function assertLocalScopeDistinctFromGlobal(
  targetPath: string,
  globalConfigPath: string | undefined,
  actionDescription: string
): void {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  if (isSameConfigFilePath(targetPath, globalPath)) {
    throw new ConfigValidationError(
      `Cannot ${actionDescription} because the current directory resolves to the global config file (${globalPath}); use "global" or run from a project directory.`,
      [{ path: "target", message: "Local config path matches global config path" }]
    );
  }
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

function normalizeFilterMap(
  rawFilters: unknown,
  defaultValue = false
): MetadataFilterMap {
  const src = isPlainObject(rawFilters) ? rawFilters : {};
  const out: MetadataFilterMap = { component: {}, layer: {}, design: {} };
  for (const cat of VALID_FILTER_CATEGORIES) {
    const catKey = cat as FilterCategory;
    const rawCat = isPlainObject(src[catKey]) ? (src[catKey] as Record<string, unknown>) : {};
    for (const field of Object.keys(FULL_METADATA_FILTERS[catKey])) {
      const val = rawCat[field];
      out[catKey][field] = typeof val === "boolean" ? val : defaultValue;
    }
  }
  return out;
}

function validateMetadataFilterFilters(
  filters: unknown,
  fieldPrefix: string,
  issues: ConfigValidationIssue[]
): Partial<Record<FilterCategory, Record<string, boolean>>> | undefined {
  if (!isPlainObject(filters)) {
    issues.push({ path: fieldPrefix, message: `${fieldPrefix} must be an object` });
    return undefined;
  }
  const outFilters: Partial<Record<FilterCategory, Record<string, boolean>>> = {};
  for (const category of Object.keys(filters)) {
    if (DISALLOWED_PROTO_KEYS.has(category) || !VALID_FILTER_CATEGORIES.has(category)) {
      issues.push({
        path: `${fieldPrefix}.${category}`,
        message: `Unknown metadataFilter category: ${fieldPrefix}.${category}`,
      });
      continue;
    }
    const catObj = filters[category];
    if (!isPlainObject(catObj)) {
      issues.push({
        path: `${fieldPrefix}.${category}`,
        message: `${fieldPrefix}.${category} must be an object`,
      });
      continue;
    }
    const outCat: Record<string, boolean> = {};
    for (const field of Object.keys(catObj)) {
      if (DISALLOWED_PROTO_KEYS.has(field)) {
        issues.push({
          path: `${fieldPrefix}.${category}.${field}`,
          message: `Invalid filter key: ${field}`,
        });
        continue;
      }
      const parsedBool = validateBoolean(
        catObj[field],
        `${fieldPrefix}.${category}.${field}`,
        issues
      );
      if (parsedBool !== undefined) {
        outCat[field] = parsedBool;
      }
    }
    outFilters[category as FilterCategory] = outCat;
  }
  return outFilters;
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
    if (
      DISALLOWED_PROTO_KEYS.has(key) ||
      (key !== "panelPosition" && key !== "filters" && key !== "preset" && key !== "presets")
    ) {
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
    } else if (key === "preset") {
      const presetVal = raw.preset;
      const valid = typeof presetVal === "string" ? presetVal.trim() : "";
      if (valid.length === 0 || DISALLOWED_PROTO_KEYS.has(valid)) {
        issues.push({
          path: "metadataFilter.preset",
          message: "metadataFilter.preset must be a valid non-empty string",
        });
      } else {
        out.preset = valid;
      }
    } else if (key === "presets") {
      const presetsObj = raw.presets;
      if (!isPlainObject(presetsObj)) {
        issues.push({ path: "metadataFilter.presets", message: "metadataFilter.presets must be an object" });
        continue;
      }
      const outPresets: Record<string, MetadataFilterPresetPayload> = {};
      for (const presetName of Object.keys(presetsObj)) {
        if (
          DISALLOWED_PROTO_KEYS.has(presetName) ||
          presetName.trim().length === 0 ||
          presetName.trim().toLowerCase() === "custom"
        ) {
          issues.push({
            path: `metadataFilter.presets.${presetName}`,
            message: `Invalid filter preset name: ${presetName}`,
          });
          continue;
        }
        const validatedFilters = validateMetadataFilterFilters(
          presetsObj[presetName],
          `metadataFilter.presets.${presetName}`,
          issues
        );
        if (validatedFilters) {
          outPresets[presetName.trim()] = validatedFilters;
        }
      }
      out.presets = outPresets;
    } else if (key === "filters") {
      const validatedFilters = validateMetadataFilterFilters(raw.filters, "metadataFilter.filters", issues);
      if (validatedFilters) {
        out.filters = validatedFilters;
      }
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
    if (segments.length === 2 && segments[1] === "preset") {
      return parseConfigDelta({ metadataFilter: { preset: rawValue } });
    }
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

const LOCAL_ONLY_SCAN_KEYS = ["include", "ignore", "respectGitignore"] as const;

function stripNonRuntimeKeys(
  raw: Record<string, unknown>,
  isGlobal = false
): Record<string, unknown> {
  const sanitized = { ...raw };
  delete sanitized.recentProjects;
  delete sanitized.presets;
  delete sanitized.activePreset;
  delete sanitized.preset;
  if (isPlainObject(sanitized.metadataFilter)) {
    const mfCopy = { ...sanitized.metadataFilter };
    delete mfCopy.presets;
    sanitized.metadataFilter = mfCopy;
  }
  if (isGlobal) {
    for (const key of LOCAL_ONLY_SCAN_KEYS) {
      delete sanitized[key];
    }
  }
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

export function validateFilterPresetName(name: unknown): string {
  const trimmed = validatePresetName(name);
  if (trimmed.toLowerCase() === "custom") {
    throw new ConfigValidationError('Preset name "custom" is reserved', [
      { path: "preset", message: 'Preset name "custom" is reserved' },
    ]);
  }
  return trimmed;
}

function readValidFilterPresetName(value: unknown): string | null {
  const valid = readValidPresetName(value);
  if (!valid || valid.toLowerCase() === "custom") {
    return null;
  }
  return valid;
}

function readSelectedFilterPreset(raw: Record<string, unknown> | null): string | null {
  if (!raw || !isPlainObject(raw.metadataFilter)) {
    return null;
  }
  const rawPreset = raw.metadataFilter.preset;
  if (typeof rawPreset !== "string") {
    return null;
  }
  const trimmed = rawPreset.trim();
  if (trimmed.length === 0 || DISALLOWED_PROTO_KEYS.has(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() === "custom" ? "custom" : trimmed;
}

function readFilterPresetsMap(raw: Record<string, unknown> | null): Record<string, MetadataFilterMap> {
  const result: Record<string, MetadataFilterMap> = {};
  if (!raw || !isPlainObject(raw.metadataFilter) || !isPlainObject(raw.metadataFilter.presets)) {
    return result;
  }
  const rawPresets = raw.metadataFilter.presets;
  for (const key of Object.keys(rawPresets)) {
    const validName = readValidFilterPresetName(key);
    if (!validName) {
      continue;
    }
    const candidate = rawPresets[key];
    if (!isPlainObject(candidate)) {
      continue;
    }
    result[validName] = normalizeFilterMap(candidate, false);
  }
  return result;
}

function resolveFilterPresetCatalog(
  globalRaw: Record<string, unknown> | null,
  localRaw: Record<string, unknown> | null
): {
  presets: Record<string, MetadataFilterMap>;
  sources: Record<string, MetadataFilterPresetSource>;
  builtinNames: string[];
  globalPresets: Record<string, MetadataFilterMap>;
  localPresets: Record<string, MetadataFilterMap>;
} {
  const presets: Record<string, MetadataFilterMap> = {};
  const sources: Record<string, MetadataFilterPresetSource> = {};
  const builtinNames = Object.keys(BUILTIN_METADATA_FILTER_PRESETS);

  for (const name of builtinNames) {
    presets[name] = structuredClone(BUILTIN_METADATA_FILTER_PRESETS[name]);
    sources[name] = "builtin";
  }

  const globalPresets = readFilterPresetsMap(globalRaw);
  for (const name of Object.keys(globalPresets)) {
    presets[name] = structuredClone(globalPresets[name]);
    sources[name] = "global";
  }

  const localPresets = readFilterPresetsMap(localRaw);
  for (const name of Object.keys(localPresets)) {
    presets[name] = structuredClone(localPresets[name]);
    sources[name] = "local";
  }

  return { presets, sources, builtinNames, globalPresets, localPresets };
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

export interface ConfigMigrationResult {
  migrated: Record<string, unknown>;
  changed: boolean;
  fromVersion: number;
  toVersion: number;
}

export function migrateConfigObject(
  raw: Record<string, unknown>,
  scope: "global" | "local"
): ConfigMigrationResult {
  const rawVer = raw.schemaVersion;
  if (
    rawVer !== undefined &&
    (typeof rawVer !== "number" || !Number.isInteger(rawVer) || rawVer < 0)
  ) {
    console.warn(
      `[HoverSource] Invalid config schemaVersion (${String(rawVer)}); skipping automatic migration to preserve file.`
    );
    return {
      migrated: structuredClone(raw),
      changed: false,
      fromVersion: -1,
      toVersion: -1,
    };
  }

  const fromVersion = typeof rawVer === "number" ? rawVer : 0;

  if (fromVersion > CURRENT_CONFIG_SCHEMA_VERSION) {
    console.warn(
      `[HoverSource] Config schemaVersion ${fromVersion} is newer than supported v${CURRENT_CONFIG_SCHEMA_VERSION}; preserving existing fields.`
    );
    return {
      migrated: structuredClone(raw),
      changed: false,
      fromVersion,
      toVersion: fromVersion,
    };
  }

  const migrated = structuredClone(raw);
  let changed = false;

  if (fromVersion < 1) {
    if (scope === "global") {
      for (const key of LOCAL_ONLY_SCAN_KEYS) {
        if (Object.prototype.hasOwnProperty.call(migrated, key)) {
          delete migrated[key];
          changed = true;
        }
      }
    }
    migrated.schemaVersion = 1;
    changed = true;
  }

  if (fromVersion < 2) {
    if (
      isPlainObject(migrated.metadataFilter) &&
      migrated.metadataFilter.preset === undefined &&
      isPlainObject(migrated.metadataFilter.filters)
    ) {
      migrated.metadataFilter = {
        ...migrated.metadataFilter,
        preset: "custom",
      };
      changed = true;
    }
    migrated.schemaVersion = 2;
    changed = true;
  } else if (raw.schemaVersion !== CURRENT_CONFIG_SCHEMA_VERSION) {
    migrated.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;
    changed = true;
  }

  return {
    migrated,
    changed,
    fromVersion,
    toVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  };
}

function readAndMigrateConfigFile(
  filePath: string,
  scope: "global" | "local"
): Record<string, unknown> | null {
  const raw = readConfigFromFile(filePath);
  if (!raw) {
    return null;
  }

  const { migrated, changed, fromVersion } = migrateConfigObject(raw, scope);
  if (changed) {
    const backupPath = `${filePath}.bak.v${fromVersion}`;
    try {
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, fs.readFileSync(filePath));
      }
      writeJsonAtomic(filePath, migrated);
    } catch (err) {
      console.warn(`[HoverSource] Failed to persist migrated config at ${filePath}:`, err);
    }
  }
  return migrated;
}

export function loadMergedConfig(projectRoot: string, globalConfigPath?: string): HoverSourceConfig {
  let config = cloneDefaultConfig();

  const globalPath = getGlobalConfigPath(globalConfigPath);
  const globalConfig = readAndMigrateConfigFile(globalPath, "global");
  if (globalConfig) {
    config = mergeDeep<HoverSourceConfig>(config, stripNonRuntimeKeys(globalConfig, true));
  }

  const localPath = getLocalConfigPath(projectRoot);
  const localConfig = isSameConfigFilePath(localPath, globalPath)
    ? null
    : readAndMigrateConfigFile(localPath, "local");

  const localPresetName = readValidPresetName(localConfig?.preset);
  const globalActivePresetName = readValidPresetName(globalConfig?.activePreset);
  const resolvedPresetName = localPresetName ?? globalActivePresetName;
  let fullPresetConfig: PresetConfig | undefined;

  if (resolvedPresetName && globalConfig) {
    const presetsMap = readPresetsMap(globalConfig);
    if (Object.prototype.hasOwnProperty.call(presetsMap, resolvedPresetName)) {
      fullPresetConfig = presetsMap[resolvedPresetName];
      config = mergeDeep<HoverSourceConfig>(config, stripNonRuntimeKeys(fullPresetConfig as Record<string, unknown>, true));
    }
  }

  if (localConfig) {
    config = mergeDeep<HoverSourceConfig>(config, stripNonRuntimeKeys(localConfig, false));
  }

  const catalog = resolveFilterPresetCatalog(globalConfig, localConfig);
  const localSelectedFilterPreset = readSelectedFilterPreset(localConfig);
  const fullPresetSelectedFilter = readSelectedFilterPreset(
    (fullPresetConfig as Record<string, unknown> | undefined) ?? null
  );
  const globalSelectedFilterPreset = readSelectedFilterPreset(globalConfig);

  let effectiveFilterPreset =
    localSelectedFilterPreset ??
    fullPresetSelectedFilter ??
    globalSelectedFilterPreset ??
    DEFAULT_METADATA_FILTER_PRESET;

  if (
    effectiveFilterPreset !== "custom" &&
    Object.prototype.hasOwnProperty.call(catalog.presets, effectiveFilterPreset)
  ) {
    config.metadataFilter = {
      ...(config.metadataFilter ?? {}),
      preset: effectiveFilterPreset,
      filters: structuredClone(catalog.presets[effectiveFilterPreset]),
    };
  } else if (effectiveFilterPreset === "custom") {
    let customFilters = structuredClone(FULL_METADATA_FILTERS);
    if (isPlainObject(globalConfig?.metadataFilter) && isPlainObject(globalConfig.metadataFilter.filters)) {
      customFilters = mergeDeep<MetadataFilterMap>(customFilters, globalConfig.metadataFilter.filters);
    }
    if (
      fullPresetConfig &&
      isPlainObject(fullPresetConfig.metadataFilter) &&
      isPlainObject(fullPresetConfig.metadataFilter.filters)
    ) {
      customFilters = mergeDeep<MetadataFilterMap>(customFilters, fullPresetConfig.metadataFilter.filters);
    }
    if (isPlainObject(localConfig?.metadataFilter) && isPlainObject(localConfig.metadataFilter.filters)) {
      customFilters = mergeDeep<MetadataFilterMap>(customFilters, localConfig.metadataFilter.filters);
    }
    config.metadataFilter = {
      ...(config.metadataFilter ?? {}),
      preset: "custom",
      filters: normalizeFilterMap(customFilters, true),
    };
  } else {
    effectiveFilterPreset = DEFAULT_METADATA_FILTER_PRESET;
    config.metadataFilter = {
      ...(config.metadataFilter ?? {}),
      preset: effectiveFilterPreset,
      filters: structuredClone(catalog.presets[effectiveFilterPreset]),
    };
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
    const raw = readAndMigrateConfigFile(globalPath, "global");
    if (raw) {
      targetConfig = mergeDeep<HoverSourceConfig>(targetConfig, stripNonRuntimeKeys(raw, true));
    }
  } else if (queryTarget === "local") {
    const localPath = getLocalConfigPath(defaultRoot);
    const globalPath = getGlobalConfigPath(globalConfigPath);
    const raw = isSameConfigFilePath(localPath, globalPath)
      ? null
      : readAndMigrateConfigFile(localPath, "local");
    if (raw) {
      targetConfig = mergeDeep<HoverSourceConfig>(targetConfig, stripNonRuntimeKeys(raw));
    }
  } else if (queryTarget === "custom" && customPath) {
    const customPathConfig = getLocalConfigPath(customPath);
    const globalPath = getGlobalConfigPath(globalConfigPath);
    const raw = isSameConfigFilePath(customPathConfig, globalPath)
      ? null
      : readAndMigrateConfigFile(customPathConfig, "local");
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
  if (target !== "global") {
    assertLocalScopeDistinctFromGlobal(targetPath, globalConfigPath, "save local config");
  }
  if (target === "custom" && customPath) {
    registerRecentProject(customPath, globalConfigPath);
  }

  const scope: "global" | "local" = target === "global" ? "global" : "local";
  const existing = readAndMigrateConfigFile(targetPath, scope) ?? {};
  const mergedTarget = mergeDeep<Record<string, unknown>>(existing, parsed.value);
  if (parsed.value.metadataFilter && isPlainObject(mergedTarget.metadataFilter)) {
    const mfDelta = parsed.value.metadataFilter;
    const mfTarget = mergedTarget.metadataFilter;
    if (mfDelta.preset && mfDelta.preset !== "custom" && mfDelta.filters === undefined) {
      delete mfTarget.filters;
    } else if (mfDelta.filters !== undefined && mfDelta.preset === undefined) {
      mfTarget.preset = "custom";
    }
  }
  stripNullPortOverrides(mergedTarget);
  if (
    typeof existing.schemaVersion !== "number" ||
    existing.schemaVersion <= CURRENT_CONFIG_SCHEMA_VERSION
  ) {
    mergedTarget.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;
  }

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
  if (target !== "global") {
    assertLocalScopeDistinctFromGlobal(targetPath, globalConfigPath, "reset local config");
  }
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
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const isGlobalAlias = target !== "global" && isSameConfigFilePath(targetPath, globalPath);

  let deletedFile = false;
  if (!isGlobalAlias && fs.existsSync(targetPath)) {
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
    const localPath = getLocalConfigPath(projectRoot);
    const localRaw = isSameConfigFilePath(localPath, globalPath)
      ? null
      : readConfigFromFile(localPath);
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
  assertLocalScopeDistinctFromGlobal(localPath, globalConfigPath, "bind a repo preset");

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


export function listFilterPresets(
  projectRoot: string,
  globalConfigPath?: string
): FilterPresetListResult {
  const globalPath = getGlobalConfigPath(globalConfigPath);
  const localPath = getLocalConfigPath(projectRoot);
  const globalRaw = readAndMigrateConfigFile(globalPath, "global");
  const localRaw = isSameConfigFilePath(localPath, globalPath)
    ? null
    : readAndMigrateConfigFile(localPath, "local");
  const catalog = resolveFilterPresetCatalog(globalRaw, localRaw);
  const merged = loadMergedConfig(projectRoot, globalConfigPath);

  return {
    presets: catalog.presets,
    sources: catalog.sources,
    builtinNames: catalog.builtinNames,
    globalNames: Object.keys(catalog.globalPresets),
    localNames: Object.keys(catalog.localPresets),
    activePreset: merged.metadataFilter?.preset ?? DEFAULT_METADATA_FILTER_PRESET,
    globalPreset: readSelectedFilterPreset(globalRaw),
    localPreset: readSelectedFilterPreset(localRaw),
    filters: normalizeFilterMap(merged.metadataFilter?.filters, true),
  };
}

export function saveFilterPreset(
  name: unknown,
  filtersData: MetadataFilterPresetPayload | null | undefined,
  scope: "local" | "global",
  projectRoot: string,
  globalConfigPath?: string
): SaveFilterPresetResult {
  const validatedName = validateFilterPresetName(name);
  let normalizedFilters: MetadataFilterMap;

  if (filtersData === null || filtersData === undefined) {
    const merged = loadMergedConfig(projectRoot, globalConfigPath);
    normalizedFilters = normalizeFilterMap(merged.metadataFilter?.filters, true);
  } else {
    const issues: ConfigValidationIssue[] = [];
    const validated = validateMetadataFilterFilters(filtersData, "metadataFilter.filters", issues);
    if (issues.length > 0 || !validated) {
      throw new ConfigValidationError(
        issues.map((i) => i.message).join("; ") || "Invalid metadataFilter preset payload",
        issues
      );
    }
    normalizedFilters = normalizeFilterMap(validated, false);
  }

  const targetPath = scope === "global" ? getGlobalConfigPath(globalConfigPath) : getLocalConfigPath(projectRoot);
  if (scope === "local") {
    assertLocalScopeDistinctFromGlobal(targetPath, globalConfigPath, "save a local filter preset");
  }
  const targetRaw = readAndMigrateConfigFile(targetPath, scope) ?? {};
  const existingMf = isPlainObject(targetRaw.metadataFilter) ? { ...targetRaw.metadataFilter } : {};
  const existingPresets = readFilterPresetsMap(targetRaw);
  existingPresets[validatedName] = normalizedFilters;
  existingMf.presets = existingPresets;
  targetRaw.metadataFilter = existingMf;

  if (
    typeof targetRaw.schemaVersion !== "number" ||
    targetRaw.schemaVersion <= CURRENT_CONFIG_SCHEMA_VERSION
  ) {
    targetRaw.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;
  }

  writeJsonAtomic(targetPath, targetRaw);

  return {
    name: validatedName,
    scope,
    filters: normalizedFilters,
    savedTo: targetPath,
    list: listFilterPresets(projectRoot, globalConfigPath),
  };
}

export function useFilterPreset(
  name: string | null,
  scope: "local" | "global",
  projectRoot: string,
  globalConfigPath?: string
): UseFilterPresetResult {
  const targetPath = scope === "global" ? getGlobalConfigPath(globalConfigPath) : getLocalConfigPath(projectRoot);
  if (scope === "local") {
    assertLocalScopeDistinctFromGlobal(targetPath, globalConfigPath, "activate a local filter preset");
  }
  const targetRaw = readAndMigrateConfigFile(targetPath, scope) ?? {};
  const existingMf = isPlainObject(targetRaw.metadataFilter) ? { ...targetRaw.metadataFilter } : {};

  if (name === null) {
    delete existingMf.preset;
    delete existingMf.filters;
    if (Object.keys(existingMf).length > 0) {
      targetRaw.metadataFilter = existingMf;
    } else {
      delete targetRaw.metadataFilter;
    }
    if (
      typeof targetRaw.schemaVersion !== "number" ||
      targetRaw.schemaVersion <= CURRENT_CONFIG_SCHEMA_VERSION
    ) {
      targetRaw.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;
    }
    writeJsonAtomic(targetPath, targetRaw);
    return {
      activePreset: null,
      scope,
      savedTo: targetPath,
      config: loadMergedConfig(projectRoot, globalConfigPath),
      list: listFilterPresets(projectRoot, globalConfigPath),
    };
  }

  const validatedName = validateFilterPresetName(name);
  const catalog = listFilterPresets(projectRoot, globalConfigPath);
  if (!Object.prototype.hasOwnProperty.call(catalog.presets, validatedName)) {
    throw new ConfigValidationError(`Unknown filter preset "${validatedName}"`, [
      { path: "metadataFilter.preset", message: `Unknown filter preset "${validatedName}"` },
    ]);
  }

  existingMf.preset = validatedName;
  delete existingMf.filters;
  targetRaw.metadataFilter = existingMf;
  if (
    typeof targetRaw.schemaVersion !== "number" ||
    targetRaw.schemaVersion <= CURRENT_CONFIG_SCHEMA_VERSION
  ) {
    targetRaw.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;
  }

  writeJsonAtomic(targetPath, targetRaw);

  return {
    activePreset: validatedName,
    scope,
    savedTo: targetPath,
    config: loadMergedConfig(projectRoot, globalConfigPath),
    list: listFilterPresets(projectRoot, globalConfigPath),
  };
}

export function deleteFilterPreset(
  name: unknown,
  scope: "local" | "global",
  projectRoot: string,
  globalConfigPath?: string
): DeleteFilterPresetResult {
  const validatedName = validateFilterPresetName(name);
  const targetPath = scope === "global" ? getGlobalConfigPath(globalConfigPath) : getLocalConfigPath(projectRoot);
  if (scope === "local") {
    assertLocalScopeDistinctFromGlobal(targetPath, globalConfigPath, "delete a local filter preset");
  }
  const targetRaw = readAndMigrateConfigFile(targetPath, scope);
  const existingPresets = readFilterPresetsMap(targetRaw);

  if (!targetRaw || !Object.prototype.hasOwnProperty.call(existingPresets, validatedName)) {
    const currentList = listFilterPresets(projectRoot, globalConfigPath);
    const revertedTo = Object.prototype.hasOwnProperty.call(currentList.sources, validatedName)
      ? currentList.sources[validatedName]
      : null;
    return {
      deleted: false,
      name: validatedName,
      scope,
      revertedTo,
      clearedActive: false,
      savedTo: targetPath,
      config: loadMergedConfig(projectRoot, globalConfigPath),
      list: currentList,
    };
  }

  delete existingPresets[validatedName];
  const existingMf = isPlainObject(targetRaw.metadataFilter) ? { ...targetRaw.metadataFilter } : {};
  if (Object.keys(existingPresets).length > 0) {
    existingMf.presets = existingPresets;
  } else {
    delete existingMf.presets;
  }
  targetRaw.metadataFilter = existingMf;

  const globalRaw = scope === "global" ? targetRaw : readAndMigrateConfigFile(getGlobalConfigPath(globalConfigPath), "global");
  const localRaw = scope === "local" ? targetRaw : readAndMigrateConfigFile(getLocalConfigPath(projectRoot), "local");
  const afterCatalog = resolveFilterPresetCatalog(globalRaw, localRaw);
  const stillExists = Object.prototype.hasOwnProperty.call(afterCatalog.presets, validatedName);

  let clearedActive = false;
  if (!stillExists && readSelectedFilterPreset(targetRaw) === validatedName) {
    delete existingMf.preset;
    clearedActive = true;
  }

  if (Object.keys(existingMf).length > 0) {
    targetRaw.metadataFilter = existingMf;
  } else {
    delete targetRaw.metadataFilter;
  }

  writeJsonAtomic(targetPath, targetRaw);

  const nextList = listFilterPresets(projectRoot, globalConfigPath);
  return {
    deleted: true,
    name: validatedName,
    scope,
    revertedTo: stillExists ? afterCatalog.sources[validatedName] : null,
    clearedActive,
    savedTo: targetPath,
    config: loadMergedConfig(projectRoot, globalConfigPath),
    list: nextList,
  };
}
