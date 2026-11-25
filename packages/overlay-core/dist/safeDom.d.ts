/**
 * Escapes untrusted values for safe HTML text/attribute interpolation.
 */
export declare function escapeHtml(value: unknown): string;
/**
 * Parses a restricted HTML/SVG string into a `DocumentFragment` using only
 * `createElement`, `createElementNS`, and `createTextNode` (zero `innerHTML`).
 */
export declare function createSafeFragmentFromHtml(html: string): DocumentFragment;
/**
 * Safely replaces all children of `el` with the sanitized fragment parsed from `html`.
 */
export declare function setElementContentSafely(el: Element, html: string): void;
export type SafeDomChild = Node | string | number | boolean | null | undefined;
export type SafeDomAttrs = Record<string, string | number | boolean | null | undefined>;
/**
 * Creates a sanitized DOM element (`HTMLElement` or `SVGElement`) without `innerHTML`.
 * Returns `null` if `tag` is invalid or rejected.
 */
export declare function el(tag: string, attrs?: SafeDomAttrs, children?: SafeDomChild[]): HTMLElement | SVGElement | null;
