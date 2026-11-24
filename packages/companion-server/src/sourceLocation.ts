import path from "node:path";
import fs from "node:fs";
import { isLoopbackHttpUrl, resolveSourceMapFromDevUrl } from "./sourceMap.js";

function stripQueryAndHash(value: string): string {
  const queryIdx = value.indexOf("?");
  const hashIdx = value.indexOf("#");

  let cutIdx = -1;
  if (queryIdx !== -1 && hashIdx !== -1) {
    cutIdx = Math.min(queryIdx, hashIdx);
  } else if (queryIdx !== -1) {
    cutIdx = queryIdx;
  } else if (hashIdx !== -1) {
    cutIdx = hashIdx;
  }

  return cutIdx === -1 ? value : value.slice(0, cutIdx);
}

function stripViteFsPrefix(pathname: string): string {
  let afterFs = pathname.slice("/@fs/".length);
  try {
    afterFs = decodeURIComponent(afterFs);
  } catch {}

  if (/^\/[a-zA-Z]:/.test(afterFs)) {
    return afterFs.slice(1);
  }
  if (/^[a-zA-Z]:/.test(afterFs) || afterFs.startsWith("/")) {
    return afterFs;
  }
  return "/" + afterFs;
}

// Escape special regex characters to prevent ReDoS
function escapeRegExp(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function tryDirectPath(projectRoot: string, cleanFile: string): string | undefined {
  const resolved = path.resolve(projectRoot, cleanFile);
  if (fs.existsSync(resolved)) {
    return resolved;
  }
  return undefined;
}

function trySrcPath(projectRoot: string, cleanFile: string): string | undefined {
  const srcResolved = path.resolve(projectRoot, "src", cleanFile);
  if (fs.existsSync(srcResolved)) {
    return srcResolved;
  }
  return undefined;
}

function trySymlinkPath(projectRoot: string, cleanFile: string): string | undefined {
  const segments = cleanFile.replaceAll("\\", "/").split("/");
  if (segments.length > 1) {
    const firstSegment = segments[0];
    const nodeModulesPath = path.resolve(projectRoot, "node_modules", firstSegment);
    if (fs.existsSync(nodeModulesPath)) {
      try {
        const realPackagePath = fs.realpathSync(nodeModulesPath);
        const remainingPath = segments.slice(1).join("/");
        const symlinkResolved = path.resolve(realPackagePath, remainingPath);
        if (fs.existsSync(symlinkResolved)) {
          return symlinkResolved;
        }
      } catch {}
    }
  }
  return undefined;
}

function checkPackageSubdir(subdirPath: string, cleanFile: string, subdir: string): string | undefined {
  if (!fs.statSync(subdirPath).isDirectory()) {
    return undefined;
  }
  // Case A: CleanFile exists directly inside package (e.g., components/button/Button.tsx inside packages/ui)
  const pkgResolved = path.resolve(subdirPath, cleanFile);
  if (fs.existsSync(pkgResolved)) {
    return pkgResolved;
  }
  // Case B: CleanFile starts with package folder name (e.g., "ui/components/button/Button.tsx")
  if (cleanFile.startsWith(subdir + "/")) {
    const stripped = cleanFile.substring(subdir.length + 1);
    const pkgStrippedResolved = path.resolve(subdirPath, stripped);
    if (fs.existsSync(pkgStrippedResolved)) {
      return pkgStrippedResolved;
    }
  }
  return undefined;
}

function tryMonorepoPath(projectRoot: string, cleanFile: string): string | undefined {
  const monorepoDirs = ["packages", "apps"];
  for (const dir of monorepoDirs) {
    const dirPath = path.resolve(projectRoot, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      continue;
    }
    try {
      const subdirs = fs.readdirSync(dirPath);
      for (const subdir of subdirs) {
        const subdirPath = path.resolve(dirPath, subdir);
        const resolved = checkPackageSubdir(subdirPath, cleanFile, subdir);
        if (resolved) {
          return resolved;
        }
      }
    } catch {}
  }
  return undefined;
}

// Resolve a file param (possibly relative) to an absolute path
export function resolveFilePath(fileParam: string, projectRoot: string): string {
  const cleanedInput = stripQueryAndHash(fileParam.trim());

  if (/^https?:\/\//i.test(cleanedInput)) {
    try {
      const parsed = new URL(cleanedInput);
      let pathname = stripQueryAndHash(parsed.pathname);
      try {
        pathname = decodeURIComponent(pathname);
      } catch {}

      if (pathname.startsWith("/@fs/")) {
        const fsPath = stripViteFsPrefix(pathname);
        if (path.isAbsolute(fsPath) || /^[a-zA-Z]:[\\/]/.test(fsPath)) {
          return fsPath;
        }
      }

      const relFromUrl = pathname.replace(/^\/+/, "");
      return (
        tryDirectPath(projectRoot, relFromUrl) ??
        trySrcPath(projectRoot, relFromUrl) ??
        trySymlinkPath(projectRoot, relFromUrl) ??
        tryMonorepoPath(projectRoot, relFromUrl) ??
        path.resolve(projectRoot, relFromUrl)
      );
    } catch {
      // Fall through to relative path normalization if URL parsing fails
    }
  }

  if (cleanedInput.startsWith("/@fs/")) {
    const fsPath = stripViteFsPrefix(cleanedInput);
    if (path.isAbsolute(fsPath) || /^[a-zA-Z]:[\\/]/.test(fsPath)) {
      return fsPath;
    }
  }

  if (path.isAbsolute(cleanedInput) || /^[a-zA-Z]:[\\/]/.test(cleanedInput)) {
    return cleanedInput;
  }

  let cleanFile = cleanedInput;
  if (cleanFile.startsWith("[project]/")) {
    cleanFile = cleanFile.substring("[project]/".length);
  }
  // Strip leading host/port prefixes like "5173/", "localhost:3000/", etc.
  cleanFile = cleanFile.replace(/^(?:https?:\/\/)?(?:[a-zA-Z0-9.-]+)?(?::\d+)?\//, "");
  // If the path starts with digits followed by a slash (e.g., "5173/"), strip it
  cleanFile = cleanFile.replace(/^\d+\//, "");
  // If it starts with "/", strip it
  if (cleanFile.startsWith("/")) {
    cleanFile = cleanFile.substring(1);
  }

  return (
    tryDirectPath(projectRoot, cleanFile) ??
    trySrcPath(projectRoot, cleanFile) ??
    trySymlinkPath(projectRoot, cleanFile) ??
    tryMonorepoPath(projectRoot, cleanFile) ??
    path.resolve(projectRoot, cleanFile)
  );
}

function checkCurrentLine(
  lines: string[],
  targetLineIndex: number,
  tagName?: string,
  classes?: string[]
): boolean {
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return false;
  }
  const targetLine = lines[targetLineIndex];
  let matchesTag = false;
  let matchesClass = false;

  if (tagName) {
    const tagRegex = new RegExp(String.raw`<${escapeRegExp(tagName)}\b|${escapeRegExp(tagName)}`, "i");
    matchesTag = tagRegex.test(targetLine);
  }

  if (classes && classes.length > 0) {
    matchesClass = classes.some((cls) => cls.trim() && targetLine.includes(cls));
  }

  return matchesTag || matchesClass;
}

function searchLineByClasses(lines: string[], classes: string[]): { line: number; column: number } | null {
  for (const cls of classes) {
    const cleanCls = cls.trim();
    if (!cleanCls) continue;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(cleanCls)) {
        const colIndex = lines[i].indexOf(cleanCls) + 1;
        return { line: i + 1, column: colIndex };
      }
    }
  }
  return null;
}

function searchLineByTag(
  lines: string[],
  targetLineIndex: number,
  tagName: string
): { line: number; column: number } | null {
  const tagPattern = String.raw`<${escapeRegExp(tagName)}\b`;
  const tagRegex = new RegExp(tagPattern, "i");

  let bestLine = -1;
  let minDistance = Infinity;

  for (let i = 0; i < lines.length; i++) {
    if (tagRegex.test(lines[i])) {
      const distance = Math.abs(i - targetLineIndex);
      if (distance < minDistance) {
        minDistance = distance;
        bestLine = i + 1;
      }
    }
  }

  if (bestLine !== -1) {
    const colIndex = lines[bestLine - 1].toLowerCase().indexOf(`<${tagName.toLowerCase()}`) + 1;
    return { line: bestLine, column: colIndex || 1 };
  }
  return null;
}

export function verifyAndCorrectSourceLocation(
  filePath: string,
  line: number,
  col: number,
  tagName?: string,
  classes?: string[]
): { line: number; column: number } {
  if (!fs.existsSync(filePath)) {
    return { line, column: col };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    // 1. Validate if the line is already correct.
    const targetLineIndex = line - 1;
    if (checkCurrentLine(lines, targetLineIndex, tagName, classes)) {
      return { line, column: col };
    }

    // 2. Correct the line (fallback lookup)
    // First, try searching for the class names since classes are highly specific.
    if (classes && classes.length > 0) {
      const classMatch = searchLineByClasses(lines, classes);
      if (classMatch) return classMatch;
    }

    // Second, if no class matched, search for the tagName.
    if (tagName) {
      const tagMatch = searchLineByTag(lines, targetLineIndex, tagName);
      if (tagMatch) return tagMatch;
    }
  } catch (e) {
    console.warn(`[HoverSource] Failed to verify and correct source line for ${filePath}`, e);
  }

  return { line, column: col };
}

function isSameBasename(sourcePath: string, targetPath: string): boolean {
  const cleanSource = stripQueryAndHash(sourcePath).replaceAll("\\", "/");
  const cleanTarget = targetPath.replaceAll("\\", "/");
  const srcBase = path.posix.basename(cleanSource);
  const tgtBase = path.posix.basename(cleanTarget);
  if (!srcBase || !tgtBase) {
    return false;
  }
  return process.platform === "win32"
    ? srcBase.toLowerCase() === tgtBase.toLowerCase()
    : srcBase === tgtBase;
}

export interface ValidateSourceLocationOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function validateSourceLocation(
  fileParam: string,
  projectRoot: string,
  line: number,
  col: number,
  tagName?: string,
  classes?: string[],
  options?: ValidateSourceLocationOptions
): Promise<{ line: number; column: number; correctedFile: string }> {
  const absolutePath = resolveFilePath(fileParam, projectRoot);

  if (isLoopbackHttpUrl(fileParam)) {
    const mapped = await resolveSourceMapFromDevUrl(fileParam, line, col, options);
    if (mapped && mapped.line >= 1) {
      if (!mapped.source || isSameBasename(mapped.source, absolutePath)) {
        return {
          line: mapped.line,
          column: mapped.column,
          correctedFile: absolutePath,
        };
      }

      const candidateFromRoot = resolveFilePath(mapped.source, projectRoot);
      if (fs.existsSync(candidateFromRoot)) {
        return {
          line: mapped.line,
          column: mapped.column,
          correctedFile: candidateFromRoot,
        };
      }

      const candidateRelative = path.resolve(
        path.dirname(absolutePath),
        stripQueryAndHash(mapped.source)
      );
      if (fs.existsSync(candidateRelative)) {
        return {
          line: mapped.line,
          column: mapped.column,
          correctedFile: candidateRelative,
        };
      }
    }
  }

  const corrected = verifyAndCorrectSourceLocation(
    absolutePath,
    line,
    col,
    tagName,
    classes
  );
  return {
    line: corrected.line,
    column: corrected.column,
    correctedFile: absolutePath,
  };
}
