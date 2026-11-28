/**
 * Shared clipboard path, coordinate, and CSS property compaction utilities.
 */
export declare function normalizePathSlashes(rawPath: string): string;
export declare function normalizeRootPrefix(projectRoot: string): string;
export declare function prependRootHeader(body: string, projectRoot: string | null | undefined, anyStripped: boolean): string;
/**
 * Strips a matching workspace `projectRoot` prefix from `rawPath` while leaving
 * external filesystem paths and URLs untouched.
 */
export declare function formatProjectPath(rawPath: string, projectRoot?: string | null): {
    path: string;
    stripped: boolean;
};
/**
 * Formats a file coordinate cleanly as `path:line:col` (omitting empty `:col` / `:line`).
 */
export declare function formatSourceLocation(rawPath: string, line?: number | null, column?: number | null, projectRoot?: string | null): {
    text: string;
    stripped: boolean;
};
/**
 * Collapses paired identical `overflow-x` + `overflow-y` declarations into a
 * single `overflow` entry while preserving differing axes and entry order.
 */
export declare function collapseOverflowPairs(entries: Array<[string, string]>): Array<[string, string]>;
