/**
 * Shared clipboard path, coordinate, and CSS property compaction utilities.
 */
export function normalizePathSlashes(rawPath) {
    return rawPath.replaceAll("\\", "/");
}
export function normalizeRootPrefix(projectRoot) {
    const normalized = normalizePathSlashes(projectRoot).trim();
    if (normalized.length <= 1)
        return normalized;
    return normalized.replace(/\/+$/, "");
}
export function prependRootHeader(body, projectRoot, anyStripped) {
    if (!anyStripped || !projectRoot)
        return body;
    const root = normalizeRootPrefix(projectRoot);
    return body ? `Root: ${root}\n${body}` : `Root: ${root}`;
}
function isUrlLike(value) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}
/**
 * Strips a matching workspace `projectRoot` prefix from `rawPath` while leaving
 * external filesystem paths and URLs untouched.
 */
export function formatProjectPath(rawPath, projectRoot) {
    if (!rawPath) {
        return { path: rawPath, stripped: false };
    }
    if (isUrlLike(rawPath) || !projectRoot) {
        return { path: normalizePathSlashes(rawPath), stripped: false };
    }
    const normPath = normalizePathSlashes(rawPath);
    const normRoot = normalizeRootPrefix(projectRoot);
    if (!normRoot || normPath.length <= normRoot.length) {
        return { path: normPath, stripped: false };
    }
    const isWindowsDrive = /^[a-z]:/i.test(normRoot);
    const prefixMatches = isWindowsDrive
        ? normPath.slice(0, normRoot.length).toLowerCase() === normRoot.toLowerCase()
        : normPath.startsWith(normRoot);
    if (!prefixMatches) {
        return { path: normPath, stripped: false };
    }
    if (normRoot === "/") {
        return { path: normPath.slice(1), stripped: true };
    }
    if (normPath[normRoot.length] !== "/") {
        return { path: normPath, stripped: false };
    }
    return {
        path: normPath.slice(normRoot.length + 1),
        stripped: true,
    };
}
/**
 * Formats a file coordinate cleanly as `path:line:col` (omitting empty `:col` / `:line`).
 */
export function formatSourceLocation(rawPath, line, column, projectRoot) {
    const { path, stripped } = formatProjectPath(rawPath, projectRoot);
    if (!line || line <= 0) {
        return { text: path, stripped };
    }
    if (!column || column <= 0) {
        return { text: `${path}:${line}`, stripped };
    }
    return { text: `${path}:${line}:${column}`, stripped };
}
/**
 * Collapses paired identical `overflow-x` + `overflow-y` declarations into a
 * single `overflow` entry while preserving differing axes and entry order.
 */
export function collapseOverflowPairs(entries) {
    let overflowX;
    let overflowY;
    for (const [key, val] of entries) {
        if (key === "overflow-x")
            overflowX = val;
        if (key === "overflow-y")
            overflowY = val;
    }
    if (overflowX === undefined || overflowY === undefined || overflowX !== overflowY) {
        return entries;
    }
    const out = [];
    let emittedOverflow = false;
    for (const [key, val] of entries) {
        if (key === "overflow-x" || key === "overflow-y") {
            if (!emittedOverflow) {
                out.push(["overflow", overflowX]);
                emittedOverflow = true;
            }
            continue;
        }
        out.push([key, val]);
    }
    return out;
}
