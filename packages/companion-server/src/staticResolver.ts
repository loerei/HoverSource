import fs from "node:fs";
import path from "node:path";

/** Strip JSDoc/block/line comment markers from a single comment line. */
function stripCommentMarkers(line: string): string {
  let s = line.trim();
  // /** or /*
  if (s.startsWith("/**")) s = s.slice(3);
  else if (s.startsWith("/*")) s = s.slice(2);
  // * (interior block comment line)
  else if (s.startsWith("*")) s = s.slice(1);
  // //
  else if (s.startsWith("//")) s = s.slice(2);
  // trailing */
  if (s.endsWith("*/")) s = s.slice(0, -2);
  return s.trim();
}

export interface StaticMetadata {
  rawAttributes: Record<string, string>;
  comments: string[];
  classOrigins: Record<string, { file: string; line: number; column: number }>;
}

export interface StaticHtmlQuery {
  tagName: string;
  id?: string;
  classList?: string[];
  attributes?: Record<string, string>;
  textContent?: string;
}

export interface StaticHtmlEntry {
  tagName: string;
  id?: string;
  classList: string[];
  attributes: Record<string, string>;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

export interface StaticHtmlLocation {
  fileName: string;
  absolutePath: string;
  lineNumber: number;
  columnNumber: number;
  framework: string;
}

function escapeRegex(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface StaticScanOptions {
  include?: string[];
  ignore?: string[];
  respectGitignore?: boolean;
}

const DEFAULT_HARD_IGNORE_DIRS = new Set<string>([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "build_output",
]);
const CSS_EXTENSIONS = new Set<string>([".css", ".scss", ".sass", ".less"]);
const HTML_EXTENSIONS = new Set<string>([".html", ".htm"]);

interface GitignoreRule {
  negated: boolean;
  dirOnly: boolean;
  baseRelDir: string;
  regex: RegExp;
  descendantRegex: RegExp;
}

interface IncludeRule {
  raw: string;
  segments: string[];
  exactRegex: RegExp;
  isGlob: boolean;
  wildcardPrefix: boolean;
}

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

const MAX_GITIGNORE_BYTES = 256 * 1024;
const MAX_PATTERN_LENGTH = 512;

function parseBracketClass(pattern: string, startIdx: number): { regexPart: string; nextIdx: number } | null {
  let j = startIdx + 1;
  if (j >= pattern.length) return null;

  let body = "";
  if (pattern[j] === "!" || pattern[j] === "^") {
    body += "^";
    j++;
  }
  if (j < pattern.length && pattern[j] === "]") {
    body += "\\]";
    j++;
  }
  while (j < pattern.length && pattern[j] !== "]") {
    const ch = pattern[j];
    if (ch === "/") {
      return null;
    }
    if (ch === "\\" && j + 1 < pattern.length) {
      body += `\\${pattern[j + 1]}`;
      j += 2;
      continue;
    }
    body += ch;
    j++;
  }
  if (j >= pattern.length || pattern[j] !== "]" || body === "" || body === "^") {
    return null;
  }
  return { regexPart: `[${body}]`, nextIdx: j + 1 };
}

function globSegmentToRegex(segment: string): string {
  const bounded = segment.slice(0, MAX_PATTERN_LENGTH);
  let out = "";
  let i = 0;
  while (i < bounded.length) {
    const ch = bounded[i];
    if (ch === "*") {
      out += "[^/]*";
      i++;
    } else if (ch === "?") {
      out += "[^/]";
      i++;
    } else if (ch === "[") {
      const bracket = parseBracketClass(bounded, i);
      if (bracket) {
        out += bracket.regexPart;
        i = bracket.nextIdx;
      } else {
        out += "\\[";
        i++;
      }
    } else if (ch === "\\" && i + 1 < bounded.length) {
      out += escapeRegex(bounded[i + 1]);
      i += 2;
    } else {
      out += escapeRegex(ch);
      i++;
    }
  }
  return out;
}

function normalizeGlobPattern(pattern: string): string {
  return pattern
    .slice(0, MAX_PATTERN_LENGTH)
    .replace(/\*{3,}/g, "**")
    .replace(/(?:\*\*\/){2,}/g, "**/");
}

function globToRegexSource(pattern: string): string {
  const normalized = normalizeGlobPattern(pattern);
  let out = "";
  let i = 0;
  while (i < normalized.length) {
    if (normalized[i] === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        out += "(?:[^/]+/)*";
        i += 3;
      } else {
        out += ".*";
        i += 2;
      }
      continue;
    }
    if (normalized[i] === "*") {
      out += "[^/]*";
      i++;
      continue;
    }
    if (normalized[i] === "?") {
      out += "[^/]";
      i++;
      continue;
    }
    if (normalized[i] === "[") {
      const bracket = parseBracketClass(normalized, i);
      if (bracket) {
        out += bracket.regexPart;
        i = bracket.nextIdx;
        continue;
      }
      out += "\\[";
      i++;
      continue;
    }
    if (normalized[i] === "\\" && i + 1 < normalized.length) {
      out += escapeRegex(normalized[i + 1]);
      i += 2;
      continue;
    }
    out += escapeRegex(normalized[i]);
    i++;
  }
  return out;
}

function stripUnescapedTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === " " && line[end - 2] !== "\\") {
    end--;
  }
  return line.slice(0, end);
}

function compileGitignoreRule(rawLine: string, baseRelDir: string): GitignoreRule | null {
  const cleaned = stripUnescapedTrailingSpaces(rawLine.replace(/\r$/, ""));
  if (!cleaned || cleaned.startsWith("#")) {
    return null;
  }

  let body = cleaned;
  let negated = false;
  if (body.startsWith("!")) {
    negated = true;
    body = body.slice(1);
  } else if (body.startsWith("\\#") || body.startsWith("\\!")) {
    body = body.slice(1);
  }

  if (!body) return null;

  const dirOnly = body.endsWith("/");
  if (dirOnly) {
    body = body.replace(/\/+$/, "");
  }
  if (!body) return null;

  const hasLeadingSlash = body.startsWith("/");
  if (hasLeadingSlash) {
    body = body.slice(1);
  }
  if (!body) return null;

  const anchored = hasLeadingSlash || body.includes("/");
  const globSrc = globToRegexSource(body);
  const prefix = anchored ? "^" : "(?:^|/)";

  return {
    negated,
    dirOnly,
    baseRelDir,
    regex: new RegExp(`${prefix}${globSrc}$`),
    descendantRegex: new RegExp(`${prefix}${globSrc}/`),
  };
}

function readGitignoreRules(dirPath: string, baseRelDir: string): GitignoreRule[] {
  const gitignorePath = path.join(dirPath, ".gitignore");
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(gitignorePath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn(`[HoverSource] Unable to inspect ${gitignorePath}:`, err);
    }
    return [];
  }

  if (!stat.isFile()) {
    console.warn(`[HoverSource] Skipping non-regular .gitignore at ${gitignorePath}`);
    return [];
  }

  let fd: number | undefined;
  try {
    fd = fs.openSync(gitignorePath, "r");
    const toRead = Math.min(stat.size, MAX_GITIGNORE_BYTES);
    if (stat.size > MAX_GITIGNORE_BYTES) {
      console.warn(`[HoverSource] Truncating oversized .gitignore (> ${MAX_GITIGNORE_BYTES} bytes) at ${gitignorePath}`);
    }
    const buf = Buffer.allocUnsafe(toRead);
    const bytesRead = toRead > 0 ? fs.readSync(fd, buf, 0, toRead, 0) : 0;
    const content = buf.subarray(0, bytesRead).toString("utf-8");
    const rules: GitignoreRule[] = [];
    for (const line of content.split(/\r?\n/)) {
      const compiled = compileGitignoreRule(line, baseRelDir);
      if (compiled) {
        rules.push(compiled);
      }
    }
    return rules;
  } catch (err) {
    console.warn(`[HoverSource] Failed to read ${gitignorePath}:`, err);
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

function isIgnoredByRules(relPath: string, isDir: boolean, rules: GitignoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    let localRel = relPath;
    if (rule.baseRelDir) {
      if (!relPath.startsWith(rule.baseRelDir + "/")) {
        continue;
      }
      localRel = relPath.slice(rule.baseRelDir.length + 1);
    }

    let matched = false;
    if (rule.dirOnly) {
      matched = isDir ? rule.regex.test(localRel) : rule.descendantRegex.test(localRel);
    } else {
      matched = rule.regex.test(localRel) || (!isDir && rule.descendantRegex.test(localRel));
    }

    if (matched) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function compileIncludeRule(rawPattern: string): IncludeRule | null {
  let normalized = toPosix(rawPattern.trim()).replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    return {
      raw: ".",
      segments: [],
      exactRegex: /^.*$/,
      isGlob: false,
      wildcardPrefix: true,
    };
  }
  normalized = normalizeGlobPattern(normalized);
  const segments = normalized.split("/").filter(Boolean);
  const isGlob = /[*?[]/.test(normalized);
  const globSrc = globToRegexSource(normalized);
  return {
    raw: normalized,
    segments,
    exactRegex: isGlob ? new RegExp(`^${globSrc}$`) : new RegExp(`^${escapeRegex(normalized)}(?:/.*)?$`),
    isGlob,
    wildcardPrefix: segments.includes("**"),
  };
}

function compileIncludeRules(include?: string[]): IncludeRule[] {
  if (!Array.isArray(include) || include.length === 0) {
    return [];
  }
  const rules: IncludeRule[] = [];
  for (const item of include) {
    if (typeof item !== "string") continue;
    const compiled = compileIncludeRule(item);
    if (compiled) {
      rules.push(compiled);
    }
  }
  return rules;
}

function matchSegmentsPrefix(dirSegments: string[], ruleSegments: string[]): boolean {
  for (let i = 0; i < dirSegments.length; i++) {
    if (i >= ruleSegments.length) {
      return true;
    }
    if (ruleSegments[i] === "**") {
      return true;
    }
    const segRegex = new RegExp(`^${globSegmentToRegex(ruleSegments[i])}$`);
    if (!segRegex.test(dirSegments[i])) {
      return false;
    }
  }
  return true;
}

function shouldDescendIncludeDir(relDir: string, includeRules: IncludeRule[]): boolean {
  if (includeRules.length === 0) return true;
  const dirSegs = relDir.split("/").filter(Boolean);
  for (const rule of includeRules) {
    if (rule.segments.length === 0) return true;
    if (matchSegmentsPrefix(dirSegs, rule.segments)) {
      return true;
    }
  }
  return false;
}

function matchesIncludeFile(relFile: string, includeRules: IncludeRule[]): boolean {
  if (includeRules.length === 0) return true;
  for (const rule of includeRules) {
    if (rule.exactRegex.test(relFile)) {
      return true;
    }
    if (rule.isGlob) {
      const dirGlobPrefix = new RegExp(`^${globToRegexSource(rule.raw)}/`);
      if (dirGlobPrefix.test(relFile)) {
        return true;
      }
    }
  }
  return false;
}

function isDotEntryAllowedByInclude(relDir: string, includeRules: IncludeRule[]): boolean {
  if (includeRules.length === 0) return false;
  const dirSegs = relDir.split("/").filter(Boolean);
  const leafSeg = dirSegs[dirSegs.length - 1];
  for (const rule of includeRules) {
    if (!matchSegmentsPrefix(dirSegs, rule.segments)) {
      continue;
    }
    const segIdx = dirSegs.length - 1;
    if (segIdx < rule.segments.length && rule.segments[segIdx].startsWith(".")) {
      const segRegex = new RegExp(`^${globSegmentToRegex(rule.segments[segIdx])}$`);
      if (segRegex.test(leafSeg)) {
        return true;
      }
    }
    if (
      rule.wildcardPrefix &&
      rule.segments.some(
        (seg) => seg.startsWith(".") && new RegExp(`^${globSegmentToRegex(seg)}$`).test(leafSeg)
      )
    ) {
      return true;
    }
  }
  return false;
}

function collectFilesByExtension(
  projectRoot: string,
  allowedExtensions: Set<string>,
  scanOptions?: StaticScanOptions
): string[] {
  if (!fs.existsSync(projectRoot)) return [];

  if (scanOptions?.include !== undefined && !Array.isArray(scanOptions.include)) {
    console.warn("[HoverSource] Invalid 'include' scan option (expected string[]); skipping scan.");
    return [];
  }

  const respectGitignore = scanOptions?.respectGitignore !== false;
  const includeRules = compileIncludeRules(scanOptions?.include);
  if (Array.isArray(scanOptions?.include) && scanOptions.include.length > 0 && includeRules.length === 0) {
    console.warn("[HoverSource] Configured 'include' contains no valid patterns; skipping scan.");
    return [];
  }
  const customIgnoreRules: GitignoreRule[] = [];
  if (Array.isArray(scanOptions?.ignore)) {
    for (const pattern of scanOptions.ignore) {
      const compiled = compileGitignoreRule(pattern, "");
      if (compiled) {
        customIgnoreRules.push(compiled);
      }
    }
  }

  const results: string[] = [];

  function walk(currentDir: string, currentRel: string, inheritedGitignoreRules: GitignoreRule[]): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(currentDir);
    } catch {
      return;
    }

    const activeGitignore = respectGitignore
      ? [...inheritedGitignoreRules, ...readGitignoreRules(currentDir, currentRel)]
      : inheritedGitignoreRules;
    const effectiveIgnoreRules = [...activeGitignore, ...customIgnoreRules];

    for (const entry of entries) {
      const entryAbs = path.join(currentDir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(entryAbs);
      } catch {
        continue;
      }

      const relPath = currentRel ? `${currentRel}/${entry}` : entry;
      if (stat.isDirectory()) {
        if (entry === ".git" || entry === "node_modules") {
          continue;
        }
        if (DEFAULT_HARD_IGNORE_DIRS.has(entry)) {
          continue;
        }
        if (entry.startsWith(".") && !isDotEntryAllowedByInclude(relPath, includeRules)) {
          continue;
        }
        if (!shouldDescendIncludeDir(relPath, includeRules)) {
          continue;
        }
        if (effectiveIgnoreRules.length > 0 && isIgnoredByRules(relPath, true, effectiveIgnoreRules)) {
          continue;
        }
        walk(entryAbs, relPath, activeGitignore);
      } else {
        const ext = path.extname(entry).toLowerCase();
        if (!allowedExtensions.has(ext)) {
          continue;
        }
        if (!matchesIncludeFile(relPath, includeRules)) {
          continue;
        }
        if (effectiveIgnoreRules.length > 0 && isIgnoredByRules(relPath, false, effectiveIgnoreRules)) {
          continue;
        }
        results.push(entryAbs);
      }
    }
  }

  walk(projectRoot, "", []);
  return results;
}

function getAllCssFiles(
  projectRoot: string,
  scanOptions?: StaticScanOptions
): string[] {
  return collectFilesByExtension(projectRoot, CSS_EXTENSIONS, scanOptions);
}

function toDirSegments(filePath: string, projectRoot?: string): string[] {
  const targetDir = path.dirname(filePath);
  const normalized = projectRoot
    ? toPosix(path.relative(projectRoot, targetDir))
    : toPosix(targetDir);
  return normalized
    .toLowerCase()
    .split("/")
    .filter((seg) => seg !== "" && seg !== ".");
}

function commonPrefixDepth(a: string[], b: string[]): number {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) break;
    count++;
  }
  return count;
}

function sortCssFiles(
  cssFiles: string[],
  componentFilePath?: string,
  projectRoot?: string
): string[] {
  if (!componentFilePath) {
    return [...cssFiles].sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
  }
  const componentDir = toPosix(path.dirname(componentFilePath)).toLowerCase();
  const componentBase = path.basename(componentFilePath, path.extname(componentFilePath));
  const componentSegments = toDirSegments(componentFilePath, projectRoot);

  return [...cssFiles].sort((a, b) => {
    const dirA = toPosix(path.dirname(a)).toLowerCase();
    const dirB = toPosix(path.dirname(b)).toLowerCase();
    const baseA = path.basename(a, path.extname(a));
    const baseB = path.basename(b, path.extname(b));

    const inSameDirA = dirA === componentDir;
    const inSameDirB = dirB === componentDir;

    const baseMatchA = baseA.startsWith(componentBase) || componentBase.startsWith(baseA);
    const baseMatchB = baseB.startsWith(componentBase) || componentBase.startsWith(baseB);

    if ((inSameDirA && baseMatchA) && !(inSameDirB && baseMatchB)) return -1;
    if (!(inSameDirA && baseMatchA) && (inSameDirB && baseMatchB)) return 1;

    if (inSameDirA && !inSameDirB) return -1;
    if (!inSameDirA && inSameDirB) return 1;

    if (baseMatchA && !baseMatchB) return -1;
    if (!baseMatchA && baseMatchB) return 1;

    const prefixA = commonPrefixDepth(componentSegments, toDirSegments(a, projectRoot));
    const prefixB = commonPrefixDepth(componentSegments, toDirSegments(b, projectRoot));
    if (prefixA !== prefixB) {
      return prefixB - prefixA;
    }

    return toPosix(a).localeCompare(toPosix(b));
  });
}

function handleDoubleUnderscore(className: string, candidates: Set<string>) {
  const parts = className.split("__");
  const prefix = parts[0];
  if (!prefix) return;
  candidates.add(prefix);
  
  const subParts = prefix.split("_");
  for (const part of subParts) {
    if (part) candidates.add(part);
  }
  if (subParts.length > 1) {
    const lastPart = subParts.at(-1);
    if (lastPart) candidates.add(lastPart);
  }
}

function handleSingleUnderscorePrefix(className: string, candidates: Set<string>) {
  const parts = className.split("_").filter(Boolean);
  for (const part of parts) {
    if (part) candidates.add(part);
  }
  if (parts.length > 1) {
    const secondLastPart = parts.at(-2);
    if (secondLastPart) candidates.add(secondLastPart);
  }
}

function getCandidateClassNames(className: string): string[] {
  const candidates = new Set<string>([className]);
  if (className.includes("__")) {
    handleDoubleUnderscore(className, candidates);
  } else if (className.startsWith("_")) {
    handleSingleUnderscorePrefix(className, candidates);
  }
  return Array.from(candidates);
}

function splitSelectorList(selectorListStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  
  for (const char of selectorListStr) {
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (char === "," && parenDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function extractClassNamesFromSelector(selector: string): string[] {
  const classNames: string[] = [];
  const classPattern = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = classPattern.exec(selector)) !== null) {
    classNames.push(match[1]);
  }
  return classNames;
}

interface SelectorOrigin {
  selector: string;
  line: number;
  column: number;
}

function resolveNestedSelectors(
  rawSel: string,
  braceStack: string[][],
  origins: SelectorOrigin[],
  line: number,
  col: number
): string[] {
  const newSelectors: string[] = [];
  if (!rawSel) return newSelectors;

  const splitSels = splitSelectorList(rawSel);
  const parentList = braceStack.at(-1) ?? [];
  const activeParentSelectors = parentList.filter(p => !p.trim().startsWith("@"));

  for (const sel of splitSels) {
    const trimmedSel = sel.trim();
    if (!trimmedSel) continue;

    if (activeParentSelectors.length > 0) {
      for (const parentSel of activeParentSelectors) {
        const resolved = trimmedSel.includes("&")
          ? trimmedSel.replaceAll("&", parentSel)
          : `${parentSel} ${trimmedSel}`;
        newSelectors.push(resolved);
        origins.push({
          selector: resolved,
          line,
          column: col
        });
      }
    } else {
      newSelectors.push(trimmedSel);
      origins.push({
        selector: trimmedSel,
        line,
        column: col
      });
    }
  }
  return newSelectors;
}

class SelectorParser {
  private line = 1;
  private column = 1;
  private inString: string | null = null;
  private inComment: "line" | "block" | null = null;
  private readonly braceStack: string[][] = [];
  private currentSelector = "";
  private selectorStartLine = 1;
  private selectorStartCol = 1;
  private readonly origins: SelectorOrigin[] = [];

  constructor(private readonly content: string) {}

  private advancePos(c: string) {
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
  }

  parse(): SelectorOrigin[] {
    for (let i = 0; i < this.content.length; i++) {
      i += this.parseNext(i);
    }
    return this.origins;
  }

  private parseNext(i: number): number {
    const char = this.content[i];
    const nextChar = this.content[i + 1] || "";

    if (this.handleComments(char, nextChar)) {
      if (this.inComment === null && char === "*") {
        return 1; // skip "/"
      }
      return 0;
    }

    if (this.handleStrings(char, nextChar)) {
      if (char === "\\") {
        return 1; // skip escaped char
      }
      return 0;
    }

    if (this.detectCommentOrStringStart(char, nextChar)) {
      if (char === "/") {
        return 1; // skip the second comment char
      }
      return 0;
    }

    if (this.handleSpecialChars(char)) {
      return 0;
    }

    this.accumulateSelector(char);
    return 0;
  }

  private handleComments(char: string, nextChar: string): boolean {
    if (this.inComment === "line") {
      if (char === "\n") {
        this.inComment = null;
      }
      this.advancePos(char);
      return true;
    }

    if (this.inComment === "block") {
      if (char === "*" && nextChar === "/") {
        this.inComment = null;
        this.column += 2;
        return true;
      }
      this.advancePos(char);
      return true;
    }

    return false;
  }

  private handleStrings(char: string, nextChar: string): boolean {
    if (this.inString !== null) {
      if (char === "\\" && nextChar) {
        this.advancePos(char);
        this.advancePos(nextChar);
        return true;
      }
      if (char === this.inString) {
        this.inString = null;
      }
      this.advancePos(char);
      return true;
    }
    return false;
  }

  private detectCommentOrStringStart(char: string, nextChar: string): boolean {
    if (char === "/" && nextChar === "/") {
      this.inComment = "line";
      this.column += 2;
      return true;
    }
    if (char === "/" && nextChar === "*") {
      this.inComment = "block";
      this.column += 2;
      return true;
    }
    if (char === '"' || char === "'" || char === "`") {
      this.inString = char;
      this.advancePos(char);
      return true;
    }
    return false;
  }

  private handleSpecialChars(char: string): boolean {
    if (char === "{") {
      const rawSel = this.currentSelector.trim();
      const newSelectors = resolveNestedSelectors(
        rawSel,
        this.braceStack,
        this.origins,
        this.selectorStartLine,
        this.selectorStartCol
      );
      const fallback = rawSel ? [rawSel] : [];
      this.braceStack.push(newSelectors.length > 0 ? newSelectors : fallback);
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    if (char === "}") {
      this.braceStack.pop();
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    if (char === ";") {
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    return false;
  }

  private accumulateSelector(char: string) {
    if (this.currentSelector.trim() === "") {
      this.selectorStartLine = this.line;
      this.selectorStartCol = this.column;
    }
    this.currentSelector += char;
    this.advancePos(char);
  }
}

function parseSelectors(content: string): SelectorOrigin[] {
  return new SelectorParser(content).parse();
}

function findClassOrigins(
  projectRoot: string,
  classNames: string[],
  componentFilePath?: string,
  scanOptions?: StaticScanOptions
): Record<string, { file: string; line: number; column: number }> {
  const origins: Record<string, { file: string; line: number; column: number }> = {};
  const cssFiles = getAllCssFiles(projectRoot, scanOptions);
  const sortedCssFiles = sortCssFiles(cssFiles, componentFilePath, projectRoot);
  
  for (const file of sortedCssFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const selectorOrigins = parseSelectors(content);
      
      for (const className of classNames) {
        if (origins[className]) continue;
        
        const candidates = getCandidateClassNames(className);
        
        for (const origin of selectorOrigins) {
          const selectorClasses = extractClassNamesFromSelector(origin.selector);
          const hasMatch = candidates.some(c => selectorClasses.includes(c));
          
          if (hasMatch) {
            origins[className] = {
              file: file.replaceAll("\\", "/"),
              line: origin.line,
              column: origin.column
            };
            break;
          }
        }
      }
    } catch {}
  }
  
  return origins;
}

export class StaticContextResolver {
  private findOffsetTagLine(lines: string[], tagLineIdx: number, tagPattern: RegExp): number {
    for (let offset = 1; offset <= 5; offset++) {
      if (tagLineIdx - offset >= 0 && tagPattern.test(lines[tagLineIdx - offset])) {
        return tagLineIdx - offset;
      }
      if (tagLineIdx + offset < lines.length && tagPattern.test(lines[tagLineIdx + offset])) {
        return tagLineIdx + offset;
      }
    }
    return tagLineIdx;
  }

  private findTagLineIndex(lines: string[], line: number, tagName?: string): number {
    const tagLineIdx = line - 1;
    if (tagLineIdx < 0 || tagLineIdx >= lines.length || !tagName) {
      return tagLineIdx;
    }

    const tagPattern = new RegExp(String.raw`<${tagName}\b`, "i");
    if (tagPattern.test(lines[tagLineIdx])) {
      return tagLineIdx;
    }
    return this.findOffsetTagLine(lines, tagLineIdx, tagPattern);
  }

  private scanLineChars(currentLine: string, state: { inString: boolean; stringChar: string; openBracketCount: number }): boolean {
    for (let i = 0; i < currentLine.length; i++) {
      const char = currentLine[i];
      if (state.inString) {
        if (char === state.stringChar && currentLine[i - 1] !== "\\") {
          state.inString = false;
        }
      } else if (char === '"' || char === "'" || char === "`") {
        state.inString = true;
        state.stringChar = char;
      } else if (char === "{") {
        state.openBracketCount++;
      } else if (char === "}") {
        state.openBracketCount--;
      } else if (char === ">" && state.openBracketCount === 0) {
        return true;
      }
    }
    return false;
  }

  private accumulateTagSegment(lines: string[], tagLineIdx: number): string {
    let segment = "";
    let scanIdx = tagLineIdx;
    const state = { inString: false, stringChar: "", openBracketCount: 0 };

    while (scanIdx < lines.length && scanIdx < tagLineIdx + 10) {
      const currentLine = lines[scanIdx];
      segment += " " + currentLine;
      if (this.scanLineChars(currentLine, state)) {
        break;
      }
      scanIdx++;
    }
    return segment;
  }

  private extractAttributeValue(remaining: string): { value: string; consumedLength: number } | null {
    if (!remaining.startsWith("=")) {
      return null;
    }
    const target = remaining.slice(1).trim();
    const prefixLength = remaining.length - target.length;
    
    let valMatch = null;
    if (target.startsWith('"')) {
      valMatch = /^"([^"]*)"/.exec(target);
    } else if (target.startsWith("'")) {
      valMatch = /^'([^']*)'/.exec(target);
    } else if (target.startsWith("{")) {
      valMatch = /^{([^}]+)}/.exec(target);
    } else {
      valMatch = /^([^\s>]+)/.exec(target);
    }

    if (valMatch) {
      return {
        value: valMatch[1] ?? valMatch[0],
        consumedLength: prefixLength + valMatch[0].length,
      };
    }
    return {
      value: "true",
      consumedLength: prefixLength,
    };
  }

  private parseAttributes(tagName: string, segment: string, rawAttributes: Record<string, string>): void {
    const tagPattern = new RegExp(String.raw`<${tagName}\b([\s\S]*?)(?:/\s*)?>`, "i");
    const match = tagPattern.exec(segment);
    if (match?.[1]) {
      let remaining = match[1].trim();
      while (remaining.length > 0) {
        remaining = remaining.trim();
        const keyMatch = /^([\w-]+)/.exec(remaining);
        if (!keyMatch) break;
        const name = keyMatch[1];
        remaining = remaining.slice(name.length).trim();
        
        let value = "true";
        const valResult = this.extractAttributeValue(remaining);
        if (valResult) {
          value = valResult.value;
          remaining = remaining.slice(valResult.consumedLength);
        }
        
        if (!name.startsWith("_debug") && name !== "key") {
          rawAttributes[name] = value.trim().replaceAll(/\s+/g, " ");
        }
      }
    }
  }

  private parsePrecedingComments(lines: string[], tagLineIdx: number): string[] {
    const commentLines: string[] = [];
    let inBlockComment = false;
    let checkIdx = tagLineIdx - 1;

    while (checkIdx >= 0 && checkIdx >= tagLineIdx - 15) {
      const lineText = lines[checkIdx].trim();
      
      if (lineText.endsWith("*/")) {
        inBlockComment = true;
        if (lineText.startsWith("/*") || lineText.startsWith("/**")) {
          commentLines.unshift(lineText);
          inBlockComment = false;
        } else {
          commentLines.unshift(lineText);
        }
      } else if (inBlockComment) {
        commentLines.unshift(lineText);
        if (lineText.startsWith("/*") || lineText.startsWith("/**")) {
          inBlockComment = false;
        }
      } else if (lineText.startsWith("//")) {
        commentLines.unshift(lineText);
      } else if (lineText !== "") {
        break;
      }
      checkIdx--;
    }

    if (commentLines.length > 0) {
      return commentLines.map(c => stripCommentMarkers(c)).filter(c => c !== "");
    }
    return [];
  }

  public async resolveStaticContext(
    projectRoot: string,
    filePath: string,
    line: number,
    column: number,
    tagName?: string,
    classList?: string[],
    scanOptions?: StaticScanOptions
  ): Promise<StaticMetadata> {
    const result: StaticMetadata = {
      rawAttributes: {},
      comments: [],
      classOrigins: {}
    };

    if (!fs.existsSync(filePath)) {
      return result;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split(/\r?\n/);

      // 1. Locate the opening tag line index
      const tagLineIdx = this.findTagLineIndex(lines, line, tagName);
      if (tagLineIdx < 0 || tagLineIdx >= lines.length) {
        return result;
      }

      // 2. Extract raw attributes by reading lines forward starting from tagLineIdx
      const segment = this.accumulateTagSegment(lines, tagLineIdx);

      // Parse attributes from the accumulated segment
      if (tagName) {
        this.parseAttributes(tagName, segment, result.rawAttributes);
      }

      // 3. Extract comments preceding the tag
      result.comments = this.parsePrecedingComments(lines, tagLineIdx);

      if (classList && classList.length > 0) {
        result.classOrigins = findClassOrigins(projectRoot, classList, filePath, scanOptions);
      }

    } catch (e) {
      console.warn(`[HoverSource] Failed to parse static context for ${filePath}`, e);
    }

    return result;
  }

  public resolveStaticHtmlLocation(
    projectRoot: string,
    query: StaticHtmlQuery,
    scanOptions?: StaticScanOptions
  ): StaticHtmlLocation | null {
    const htmlFiles = sortHtmlFiles(getAllHtmlFiles(projectRoot, scanOptions), projectRoot);
    if (htmlFiles.length === 0) return null;

    const normalizedTag = (query.tagName || "").toLowerCase();
    if (!normalizedTag) return null;

    let bestMatch: {
      file: string;
      line: number;
      column: number;
      score: number;
    } | null = null;

    for (const htmlFile of htmlFiles) {
      try {
        const content = fs.readFileSync(htmlFile, "utf-8");
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const tagRegex = new RegExp(String.raw`<(${normalizedTag})\b([^>]*)`, "gi");
          let match: RegExpExecArray | null;

          while ((match = tagRegex.exec(lineText)) !== null) {
            const col = match.index + 1;
            const fullTagAttrs = match[2] || "";
            let score = 10;

            // 1. Match ID if provided
            if (query.id) {
              const idRegex = new RegExp(String.raw`\bid\s*=\s*["']${escapeRegex(query.id)}["']`, "i");
              if (idRegex.test(fullTagAttrs)) {
                score += 1000;
              } else {
                continue;
              }
            }

            // 2. Match ClassList if provided
            if (query.classList && query.classList.length > 0) {
              const classMatch = /\bclass\s*=\s*["']([^"']*)["']/i.exec(fullTagAttrs);
              if (classMatch) {
                const tagClasses = classMatch[1].split(/\s+/).filter(Boolean);
                let matchingClasses = 0;
                for (const cls of query.classList) {
                  if (tagClasses.includes(cls)) {
                    matchingClasses++;
                  }
                }
                if (matchingClasses > 0) {
                  score += matchingClasses * 100;
                }
              }
            }

            // 3. Match Attributes if provided
            if (query.attributes) {
              for (const [attrKey, attrVal] of Object.entries(query.attributes)) {
                if (!attrKey || attrKey.startsWith("_")) continue;
                const attrRegex = new RegExp(String.raw`\b${escapeRegex(attrKey)}\s*=\s*["']${escapeRegex(String(attrVal))}["']`, "i");
                if (attrRegex.test(fullTagAttrs)) {
                  score += 200;
                }
              }
            }

            const relPath = path.relative(projectRoot, htmlFile).replaceAll("\\", "/");
            if (relPath.includes("index.html")) score += 20;
            if (relPath.startsWith("src/")) score += 10;

            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                file: htmlFile,
                line: i + 1,
                column: col,
                score
              };
            }
          }
        }
      } catch {}
    }

    if (!bestMatch || (bestMatch.score < 50 && !query.id)) {
      if (!bestMatch || bestMatch.score < 20) return null;
    }

    const relPath = path.relative(projectRoot, bestMatch.file).replaceAll("\\", "/");
    return {
      fileName: relPath,
      absolutePath: bestMatch.file.replaceAll("\\", "/"),
      lineNumber: bestMatch.line,
      columnNumber: bestMatch.column,
      framework: "Vanilla"
    };
  }

  public generateStaticHtmlMap(
    projectRoot: string,
    scanOptions?: StaticScanOptions
  ): StaticHtmlEntry[] {
    const htmlFiles = sortHtmlFiles(getAllHtmlFiles(projectRoot, scanOptions), projectRoot);
    const map: StaticHtmlEntry[] = [];

    for (const htmlFile of htmlFiles) {
      try {
        const content = fs.readFileSync(htmlFile, "utf-8");
        const lines = content.split(/\r?\n/);
        const relFile = path.relative(projectRoot, htmlFile).replaceAll("\\", "/");

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
          let match: RegExpExecArray | null;

          while ((match = tagRegex.exec(lineText)) !== null) {
            const tagName = match[1].toLowerCase();
            if (["html", "head", "meta", "link", "title", "script", "style", "body"].includes(tagName)) continue;

            const attrsStr = match[2] || "";
            const col = match.index + 1;

            let id: string | undefined = undefined;
            const idMatch = /\bid=["']([^"']+)["']/i.exec(attrsStr);
            if (idMatch) id = idMatch[1];

            let classList: string[] = [];
            const classMatch = /\bclass=["']([^"']+)["']/i.exec(attrsStr);
            if (classMatch) {
              classList = classMatch[1].split(/\s+/).filter(Boolean);
            }

            const attributes: Record<string, string> = {};
            const attrRegex = /([a-zA-Z0-9-:]+)=["']([^"']*)["']/g;
            let aMatch: RegExpExecArray | null;
            while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
              if (aMatch[1] !== "id" && aMatch[1] !== "class") {
                attributes[aMatch[1]] = aMatch[2];
              }
            }

            map.push({
              tagName,
              id,
              classList,
              attributes,
              fileName: relFile,
              lineNumber: i + 1,
              columnNumber: col
            });
          }
        }
      } catch {}
    }

    return map;
  }
}

function getAllHtmlFiles(
  projectRoot: string,
  scanOptions?: StaticScanOptions
): string[] {
  return collectFilesByExtension(projectRoot, HTML_EXTENSIONS, scanOptions);
}

function sortHtmlFiles(htmlFiles: string[], projectRoot: string): string[] {
  return [...htmlFiles].sort((a, b) => {
    const relA = path.relative(projectRoot, a).replaceAll("\\", "/").toLowerCase();
    const relB = path.relative(projectRoot, b).replaceAll("\\", "/").toLowerCase();
    
    const isIndexA = relA === "index.html" || relA === "src/index.html" || relA.endsWith("/index.html");
    const isIndexB = relB === "index.html" || relB === "src/index.html" || relB.endsWith("/index.html");
    if (isIndexA && !isIndexB) return -1;
    if (!isIndexA && isIndexB) return 1;

    const inSrcA = relA.startsWith("src/");
    const inSrcB = relB.startsWith("src/");
    if (inSrcA && !inSrcB) return -1;
    if (!inSrcA && inSrcB) return 1;

    return relA.localeCompare(relB);
  });
}
