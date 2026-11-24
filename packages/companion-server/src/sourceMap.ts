export interface SourceMapPosition {
  source?: string;
  line: number;
  column: number;
}

export interface RawSourceMap {
  version?: number;
  sources?: string[];
  sourceRoot?: string;
  mappings?: string;
}

export interface ResolveSourceMapOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_MAP = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_MAP[BASE64_CHARS.charCodeAt(i)] = i;
}

/**
 * Returns true only for `http:` URLs targeting strictly loopback hostnames
 * (`localhost`, `127.0.0.1`, or `::1`).
 */
export function isLoopbackHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function decodeVlqValue(mappings: string, indexRef: { pos: number }): number | null {
  let result = 0;
  let shift = 0;
  let continuation = true;

  while (continuation) {
    if (indexRef.pos >= mappings.length) {
      return null;
    }
    const code = mappings.charCodeAt(indexRef.pos++);
    const digit = code < 128 ? BASE64_MAP[code] : -1;
    if (digit < 0) {
      return null;
    }

    continuation = (digit & 32) !== 0;
    result += (digit & 31) << shift;
    shift += 5;
    if (shift > 35) {
      return null;
    }
  }

  const isNegative = (result & 1) === 1;
  const magnitude = result >>> 1;
  return isNegative ? -magnitude : magnitude;
}

function resolveMappedSourceName(sourceMap: RawSourceMap, sourceIndex: number): string | undefined {
  const sources = sourceMap.sources;
  if (!Array.isArray(sources) || sourceIndex < 0 || sourceIndex >= sources.length) {
    return undefined;
  }
  const rawSource = sources[sourceIndex];
  if (typeof rawSource !== "string" || !rawSource) {
    return undefined;
  }
  const root = typeof sourceMap.sourceRoot === "string" ? sourceMap.sourceRoot : "";
  if (!root || rawSource.startsWith("/") || /^[a-zA-Z]+:/.test(rawSource)) {
    return rawSource;
  }
  return root.endsWith("/") ? `${root}${rawSource}` : `${root}/${rawSource}`;
}

interface DecodedSegment {
  sourceIndex: number;
  originalLine: number;
  originalColumn: number;
}

/**
 * Decodes SourceMap v3 `mappings` VLQ deltas and maps a 1-indexed
 * `(compiledLine, compiledColumn)` back to 1-indexed `{ source, line, column }`.
 */
export function decodeSourceMapLocation(
  sourceMap: RawSourceMap,
  compiledLine: number,
  compiledColumn: number
): SourceMapPosition | null {
  if (!Number.isFinite(compiledLine) || compiledLine < 1) {
    return null;
  }
  if (typeof sourceMap.mappings !== "string" || !Array.isArray(sourceMap.sources)) {
    return null;
  }

  const targetLineIdx = Math.floor(compiledLine) - 1;
  const targetColIdx = Number.isFinite(compiledColumn)
    ? Math.max(0, Math.floor(compiledColumn) - 1)
    : 0;

  const mappings = sourceMap.mappings;
  const indexRef = { pos: 0 };

  let lineIdx = 0;
  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;

  let bestMatch: DecodedSegment | null = null;
  let bestHasMapping: boolean | undefined;
  let firstMappedOnLine: DecodedSegment | null = null;

  while (indexRef.pos < mappings.length && lineIdx <= targetLineIdx) {
    const ch = mappings[indexRef.pos];

    if (ch === ";") {
      if (lineIdx === targetLineIdx) {
        break;
      }
      lineIdx++;
      generatedColumn = 0;
      indexRef.pos++;
      continue;
    }

    if (ch === ",") {
      indexRef.pos++;
      continue;
    }

    const genColDelta = decodeVlqValue(mappings, indexRef);
    if (genColDelta === null) {
      return null;
    }
    generatedColumn += genColDelta;

    const nextCh = mappings[indexRef.pos];
    const hasMoreFields =
      indexRef.pos < mappings.length && nextCh !== "," && nextCh !== ";";

    let segmentMapped = false;
    if (hasMoreFields) {
      const srcDelta = decodeVlqValue(mappings, indexRef);
      const origLineDelta = decodeVlqValue(mappings, indexRef);
      const origColDelta = decodeVlqValue(mappings, indexRef);
      if (srcDelta === null || origLineDelta === null || origColDelta === null) {
        return null;
      }
      sourceIndex += srcDelta;
      originalLine += origLineDelta;
      originalColumn += origColDelta;
      segmentMapped = true;

      // Consume optional 5th field (names index)
      const afterColCh = mappings[indexRef.pos];
      if (
        indexRef.pos < mappings.length &&
        afterColCh !== "," &&
        afterColCh !== ";"
      ) {
        const nameDelta = decodeVlqValue(mappings, indexRef);
        if (nameDelta === null) {
          return null;
        }
      }
    }

    if (lineIdx === targetLineIdx) {
      if (generatedColumn <= targetColIdx) {
        bestHasMapping = segmentMapped;
        bestMatch = segmentMapped
          ? { sourceIndex, originalLine, originalColumn }
          : null;
      } else {
        if (segmentMapped && !firstMappedOnLine) {
          firstMappedOnLine = { sourceIndex, originalLine, originalColumn };
        }
        break;
      }
    }
  }

  const chosen =
    bestHasMapping === undefined ? firstMappedOnLine : bestHasMapping ? bestMatch : null;
  if (!chosen) {
    return null;
  }

  const source = resolveMappedSourceName(sourceMap, chosen.sourceIndex);
  const mappedLine = chosen.originalLine + 1;
  const mappedColumn = chosen.originalColumn + 1;
  if (mappedLine < 1) {
    return null;
  }

  return {
    ...(source ? { source } : {}),
    line: mappedLine,
    column: mappedColumn > 0 ? mappedColumn : 1,
  };
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string | null> {
  const contentLength = res.headers?.get?.("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return null;
    }
  }

  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  if (typeof res.arrayBuffer === "function") {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return null;
    }
    return Buffer.from(buf).toString("utf-8");
  }

  const text = await res.text();
  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
    return null;
  }
  return text;
}

function extractTrailingSourceMappingUrl(code: string): string | null {
  const matches = [...code.matchAll(/^[ \t]*\/\/[#@]\s*sourceMappingURL=([^\r\n]+)$/gm)];
  if (matches.length === 0) {
    return null;
  }
  const raw = matches[matches.length - 1][1].trim();
  return raw || null;
}

function parseInlineSourceMap(dataUrl: string, maxBytes: number): RawSourceMap | null {
  const base64Match = /^data:application\/json(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
  if (base64Match) {
    const decoded = Buffer.from(base64Match[1], "base64");
    if (decoded.byteLength > maxBytes) {
      return null;
    }
    return JSON.parse(decoded.toString("utf-8")) as RawSourceMap;
  }

  const plainMatch = /^data:application\/json(?:;[^,]*)?,(.+)$/i.exec(dataUrl);
  if (plainMatch) {
    const text = decodeURIComponent(plainMatch[1]);
    if (Buffer.byteLength(text, "utf-8") > maxBytes) {
      return null;
    }
    return JSON.parse(text) as RawSourceMap;
  }

  return null;
}

/**
 * Fetches a compiled module from a loopback Vite/dev HTTP URL, extracts its
 * inline or same-origin SourceMap v3, and maps `(compiledLine, compiledColumn)`
 * back to 1-indexed original coordinates.
 */
export async function resolveSourceMapFromDevUrl(
  rawFileUrl: string,
  compiledLine: number,
  compiledColumn: number,
  options?: ResolveSourceMapOptions
): Promise<SourceMapPosition | null> {
  if (!isLoopbackHttpUrl(rawFileUrl)) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = options?.fetchImpl ?? fetch;

  try {
    const jsRes = await fetchImpl(rawFileUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (!jsRes.ok) {
      return null;
    }

    const code = await readBoundedText(jsRes, maxBytes);
    if (!code) {
      return null;
    }

    const mappingUrl = extractTrailingSourceMappingUrl(code);
    if (!mappingUrl) {
      return null;
    }

    let sourceMap: RawSourceMap | null = null;
    if (mappingUrl.startsWith("data:")) {
      sourceMap = parseInlineSourceMap(mappingUrl, maxBytes);
    } else {
      const baseUrl = new URL(rawFileUrl);
      const resolvedMapUrl = new URL(mappingUrl, baseUrl);
      if (
        !isLoopbackHttpUrl(resolvedMapUrl.href) ||
        resolvedMapUrl.origin !== baseUrl.origin
      ) {
        return null;
      }

      const mapRes = await fetchImpl(resolvedMapUrl.href, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!mapRes.ok) {
        return null;
      }
      const mapText = await readBoundedText(mapRes, maxBytes);
      if (!mapText) {
        return null;
      }
      sourceMap = JSON.parse(mapText) as RawSourceMap;
    }

    if (!sourceMap || typeof sourceMap !== "object") {
      return null;
    }

    return decodeSourceMapLocation(sourceMap, compiledLine, compiledColumn);
  } catch {
    return null;
  }
}
