export interface NormalizeStackPathOptions {
  preserveHttpOrigin?: boolean;
}

export interface NormalizedStackPath {
  fileName: string;
  isHttpUrl: boolean;
  hadViteFsPrefix: boolean;
}

export interface ParsedV8StackFrame {
  functionName?: string;
  rawLocation: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

const BUNDLER_OR_RUNTIME_FRAME_PATTERNS = [
  "hoversource-overlay.js",
  "overlay.bundle.js",
  "captureSourceLocation",
  "setupVanillaMonkeyPatch",
  "node_modules/",
  ".vite/deps/",
  "react-dom",
  "react_jsx-dev-runtime",
  "react-jsx-dev-runtime",
  "react_stack_bottom_frame",
  "node:internal",
] as const;

/**
 * Removes `?query` and `#hash` suffixes while preserving Windows drive letters and URL origins.
 */
export function stripQueryAndHash(urlOrPath: string): string {
  const queryIdx = urlOrPath.indexOf("?");
  const hashIdx = urlOrPath.indexOf("#");

  let cutIdx = -1;
  if (queryIdx !== -1 && hashIdx !== -1) {
    cutIdx = Math.min(queryIdx, hashIdx);
  } else if (queryIdx !== -1) {
    cutIdx = queryIdx;
  } else if (hashIdx !== -1) {
    cutIdx = hashIdx;
  }

  return cutIdx === -1 ? urlOrPath : urlOrPath.slice(0, cutIdx);
}

function stripViteFsPrefix(pathname: string): string {
  const afterFs = pathname.slice("/@fs/".length);
  if (/^[a-zA-Z]:/.test(afterFs) || afterFs.startsWith("/")) {
    return afterFs;
  }
  return "/" + afterFs;
}

function normalizeFileUrl(rawUrl: string): string {
  const cleaned = stripQueryAndHash(rawUrl);
  let filePath: string;

  if (cleaned.startsWith("file://localhost/")) {
    filePath = cleaned.slice("file://localhost".length);
  } else {
    filePath = cleaned.replace(/^file:\/\/\/?/, "");
  }

  if (/^\/[a-zA-Z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  } else if (!/^[a-zA-Z]:/.test(filePath) && !filePath.startsWith("/")) {
    filePath = "/" + filePath;
  }

  try {
    return decodeURIComponent(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Normalizes `file://` URLs, `http(s)://` bundler URLs, `/@fs/` prefixes, and `?query`/`#hash` suffixes.
 */
export function normalizeStackPath(
  rawTarget: string,
  options: NormalizeStackPathOptions = {}
): NormalizedStackPath {
  const trimmed = rawTarget.trim();

  if (trimmed.startsWith("file://")) {
    return {
      fileName: normalizeFileUrl(trimmed),
      isHttpUrl: false,
      hadViteFsPrefix: false,
    };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const pathname = stripQueryAndHash(url.pathname);
      const hadViteFsPrefix = pathname.startsWith("/@fs/");

      let fileName: string;
      if (hadViteFsPrefix) {
        fileName = stripViteFsPrefix(pathname);
      } else if (options.preserveHttpOrigin) {
        fileName = `${url.origin}${pathname}`;
      } else {
        fileName = pathname;
      }

      return {
        fileName,
        isHttpUrl: true,
        hadViteFsPrefix,
      };
    } catch {
      return {
        fileName: stripQueryAndHash(trimmed),
        isHttpUrl: true,
        hadViteFsPrefix: false,
      };
    }
  }

  const cleaned = stripQueryAndHash(trimmed);
  const hadViteFsPrefix = cleaned.startsWith("/@fs/");
  return {
    fileName: hadViteFsPrefix ? stripViteFsPrefix(cleaned) : cleaned,
    isHttpUrl: false,
    hadViteFsPrefix,
  };
}

/**
 * Parses a V8/Chromium stack frame line (`at fn (url:line:col)` or `at url:line:col`)
 * with 1-indexed positive integer line and column numbers.
 */
export function parseV8StackLine(
  line: string,
  options?: NormalizeStackPathOptions
): ParsedV8StackFrame | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("at ")) return null;

  const body = trimmed.slice(3).trim();
  if (!body) return null;

  let functionName: string | undefined;
  let rawLocation: string;

  if (body.endsWith(")")) {
    const sepIdx = body.indexOf(" (");
    if (sepIdx !== -1) {
      functionName = body.slice(0, sepIdx).trim() || undefined;
      rawLocation = body.slice(sepIdx + 2, -1).trim();
    } else if (body.startsWith("(")) {
      rawLocation = body.slice(1, -1).trim();
    } else {
      rawLocation = body;
    }
  } else {
    rawLocation = body;
  }

  const match = /^(.*):(\d+):(\d+)$/.exec(rawLocation);
  if (!match) return null;

  const rawTarget = match[1].trim();
  const lineNumber = Number.parseInt(match[2], 10);
  const columnNumber = Number.parseInt(match[3], 10);

  if (
    !rawTarget ||
    !Number.isInteger(lineNumber) ||
    !Number.isInteger(columnNumber) ||
    lineNumber < 1 ||
    columnNumber < 1
  ) {
    return null;
  }

  const { fileName } = normalizeStackPath(rawTarget, options);
  if (!fileName) return null;

  return {
    ...(functionName ? { functionName } : {}),
    rawLocation,
    fileName,
    lineNumber,
    columnNumber,
  };
}

/**
 * Returns true if the stack line or location belongs to HoverSource internals,
 * bundler dependencies, React runtime internals, or Node built-ins.
 */
export function isBundlerOrRuntimeFrame(locationOrLine: string): boolean {
  const normalized = locationOrLine.replaceAll("\\", "/");
  return BUNDLER_OR_RUNTIME_FRAME_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}
