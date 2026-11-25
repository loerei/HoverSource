const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_DEPTH = 64;
const VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const VALID_ATTR_NAME = /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/;
const REJECTED_TAGS = new Set([
    "script",
    "iframe",
    "object",
    "embed",
    "foreignobject",
    "style",
    "base",
    "animate",
    "set",
    "animatetransform",
    "animatemotion",
]);
const BODY_DISCARD_TAGS = new Set(["script", "style"]);
const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);
const SVG_ELEMENT_TAGS = new Set([
    "svg",
    "path",
    "rect",
    "circle",
    "line",
    "polyline",
    "polygon",
    "ellipse",
    "g",
    "defs",
    "use",
    "tspan",
    "clippath",
    "lineargradient",
    "radialgradient",
    "stop",
    "pattern",
    "mask",
    "marker",
]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction"]);
const NAMED_ENTITIES = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    apos: "'",
};
/**
 * Escapes untrusted values for safe HTML text/attribute interpolation.
 */
export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Single-pass HTML entity decoder. Rejects/replaces NUL (0x00) and
 * out-of-range code points (> 0x10FFFF) without throwing RangeError.
 * Decodes `&amp;` in the same single pass so `&amp;lt;` cannot double-decode.
 */
function decodeHtmlEntitiesOnce(input) {
    return input.replace(/&(?:(lt|gt|amp|quot|apos)|#(\d+)|#[xX]([0-9a-fA-F]+));/g, (full, named, dec, hex) => {
        if (named) {
            return NAMED_ENTITIES[named] ?? full;
        }
        const codePoint = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
            return "\uFFFD";
        }
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
            return "\uFFFD";
        }
        try {
            return String.fromCodePoint(codePoint);
        }
        catch {
            return "\uFFFD";
        }
    });
}
function isUnsafeUrlValue(decodedValue) {
    const normalized = decodedValue.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
    if (/^(?:javascript|vbscript):/.test(normalized)) {
        return true;
    }
    if (/^data:(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml)(?:[;,]|$)/.test(normalized)) {
        return true;
    }
    return false;
}
function setSanitizedAttribute(target, rawName, rawValue) {
    const attrName = rawName.trim();
    if (!attrName || !VALID_ATTR_NAME.test(attrName)) {
        return;
    }
    const attrLower = attrName.toLowerCase();
    if (attrLower.startsWith("on") || attrLower === "srcdoc") {
        return;
    }
    const decodedValue = decodeHtmlEntitiesOnce(rawValue);
    if (URL_ATTRS.has(attrLower) && isUnsafeUrlValue(decodedValue)) {
        return;
    }
    target.setAttribute(attrName, decodedValue);
}
function applyParsedAttributes(target, attrSource) {
    let i = 0;
    const len = attrSource.length;
    while (i < len) {
        while (i < len && /[\s/]/.test(attrSource[i])) {
            i++;
        }
        if (i >= len) {
            break;
        }
        const nameStart = i;
        while (i < len && !/[\s=/>]/.test(attrSource[i])) {
            i++;
        }
        const attrName = attrSource.slice(nameStart, i);
        if (!attrName) {
            i++;
            continue;
        }
        while (i < len && /\s/.test(attrSource[i])) {
            i++;
        }
        if (i < len && attrSource[i] === "=") {
            i++;
            while (i < len && /\s/.test(attrSource[i])) {
                i++;
            }
            let rawValue = "";
            if (i < len && (attrSource[i] === '"' || attrSource[i] === "'")) {
                const quote = attrSource[i];
                i++;
                const valStart = i;
                while (i < len && attrSource[i] !== quote) {
                    i++;
                }
                rawValue = attrSource.slice(valStart, i);
                if (i < len && attrSource[i] === quote) {
                    i++;
                }
            }
            else {
                const valStart = i;
                while (i < len && !/[\s>]/.test(attrSource[i])) {
                    i++;
                }
                rawValue = attrSource.slice(valStart, i);
            }
            setSanitizedAttribute(target, attrName, rawValue);
        }
        else {
            // Valueless boolean attribute (e.g. `checked`, or rejected `onerror`)
            setSanitizedAttribute(target, attrName, "");
        }
    }
}
function findTagClose(html, startPos) {
    let pos = startPos;
    let quote = null;
    while (pos < html.length) {
        const ch = html[pos];
        if (quote) {
            if (ch === quote) {
                quote = null;
            }
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        else if (ch === ">") {
            return pos;
        }
        pos++;
    }
    return -1;
}
function findClosingBodyTagEnd(html, fromPos, tagLower) {
    const closeRegex = new RegExp(`</${tagLower}\\s*>`, "gi");
    closeRegex.lastIndex = fromPos;
    const match = closeRegex.exec(html);
    if (!match) {
        return html.length;
    }
    return match.index + match[0].length;
}
function createElementForContext(tagName, inSvg) {
    if (inSvg || tagName.toLowerCase() === "svg") {
        return document.createElementNS(SVG_NS, tagName);
    }
    return document.createElement(tagName);
}
/**
 * Parses a restricted HTML/SVG string into a `DocumentFragment` using only
 * `createElement`, `createElementNS`, and `createTextNode` (zero `innerHTML`).
 */
export function createSafeFragmentFromHtml(html) {
    const fragment = document.createDocumentFragment();
    if (!html) {
        return fragment;
    }
    const stack = [
        { node: fragment, tagLower: "#fragment", inSvg: false },
    ];
    let pos = 0;
    const len = html.length;
    const appendText = (raw) => {
        if (!raw)
            return;
        const parent = stack[stack.length - 1].node;
        parent.appendChild(document.createTextNode(decodeHtmlEntitiesOnce(raw)));
    };
    while (pos < len) {
        const ltIndex = html.indexOf("<", pos);
        if (ltIndex === -1) {
            appendText(html.slice(pos));
            break;
        }
        if (ltIndex > pos) {
            appendText(html.slice(pos, ltIndex));
        }
        // HTML comment <!-- ... -->
        if (html.startsWith("<!--", ltIndex)) {
            const commentEnd = html.indexOf("-->", ltIndex + 4);
            pos = commentEnd === -1 ? len : commentEnd + 3;
            continue;
        }
        // Closing tag </tag>
        if (html.startsWith("</", ltIndex)) {
            const closeGt = html.indexOf(">", ltIndex + 2);
            if (closeGt === -1) {
                appendText(html.slice(ltIndex));
                break;
            }
            const rawCloseName = html.slice(ltIndex + 2, closeGt).trim();
            if (!VALID_TAG_NAME.test(rawCloseName)) {
                appendText(html.slice(ltIndex, closeGt + 1));
                pos = closeGt + 1;
                continue;
            }
            const closeLower = rawCloseName.toLowerCase();
            for (let s = stack.length - 1; s >= 1; s--) {
                if (stack[s].tagLower === closeLower) {
                    stack.length = s;
                    break;
                }
            }
            pos = closeGt + 1;
            continue;
        }
        // Opening tag <tag ...>
        const tagClose = findTagClose(html, ltIndex + 1);
        if (tagClose === -1) {
            // Unclosed tag: check if it's <script or <style to discard to EOF
            const rem = html.slice(ltIndex + 1);
            const nameMatch = rem.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/>]|$)/);
            if (nameMatch && BODY_DISCARD_TAGS.has(nameMatch[1].toLowerCase())) {
                break;
            }
            appendText(html.slice(ltIndex));
            break;
        }
        const inside = html.slice(ltIndex + 1, tagClose);
        const nameMatch = inside.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/]|$)/);
        if (!nameMatch) {
            appendText("<");
            pos = ltIndex + 1;
            continue;
        }
        const tagName = nameMatch[1];
        const tagLower = tagName.toLowerCase();
        const afterName = inside.slice(tagName.length);
        const isSelfClosing = /\/\s*$/.test(afterName);
        const attrSource = isSelfClosing ? afterName.replace(/\/\s*$/, "") : afterName;
        // Rejected-tag filtering takes precedence over void-element emission
        if (REJECTED_TAGS.has(tagLower)) {
            if (BODY_DISCARD_TAGS.has(tagLower) && !isSelfClosing) {
                pos = findClosingBodyTagEnd(html, tagClose + 1, tagLower);
            }
            else {
                pos = tagClose + 1;
            }
            continue;
        }
        if (stack.length - 1 >= MAX_DEPTH) {
            pos = tagClose + 1;
            continue;
        }
        const currentTop = stack[stack.length - 1];
        const isSvgElement = currentTop.inSvg || tagLower === "svg";
        const element = createElementForContext(tagName, isSvgElement);
        applyParsedAttributes(element, attrSource);
        currentTop.node.appendChild(element);
        const isVoid = VOID_TAGS.has(tagLower);
        if (!isSelfClosing && !isVoid) {
            stack.push({
                node: element,
                tagLower,
                inSvg: isSvgElement,
            });
        }
        pos = tagClose + 1;
    }
    return fragment;
}
/**
 * Safely replaces all children of `el` with the sanitized fragment parsed from `html`.
 */
export function setElementContentSafely(el, html) {
    const fragment = createSafeFragmentFromHtml(html);
    el.replaceChildren(fragment);
}
/**
 * Creates a sanitized DOM element (`HTMLElement` or `SVGElement`) without `innerHTML`.
 * Returns `null` if `tag` is invalid or rejected.
 */
export function el(tag, attrs, children) {
    if (!VALID_TAG_NAME.test(tag)) {
        return null;
    }
    const tagLower = tag.toLowerCase();
    if (REJECTED_TAGS.has(tagLower)) {
        return null;
    }
    const element = SVG_ELEMENT_TAGS.has(tagLower)
        ? document.createElementNS(SVG_NS, tag)
        : document.createElement(tag);
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (value === null || value === undefined || value === false) {
                continue;
            }
            if (value === true) {
                setSanitizedAttribute(element, key, "");
            }
            else {
                setSanitizedAttribute(element, key, String(value));
            }
        }
    }
    if (children) {
        for (const child of children) {
            if (child === null || child === undefined || child === false || child === true) {
                continue;
            }
            if (typeof child === "object" && "nodeType" in child) {
                element.appendChild(child);
            }
            else {
                element.appendChild(document.createTextNode(String(child)));
            }
        }
    }
    return element;
}
