"use strict";
(() => {
  // ../source-resolver/dist/adapters/utils.js
  function getElementMetadata(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      classList: element.classList ? Array.from(element.classList) : []
    };
  }
  function getComponentNameFromFile(file, extensions = [".vue", ".svelte", ".astro", ".tsx", ".jsx", ".ts", ".js"]) {
    if (!file)
      return void 0;
    const baseName = file.split(/[/\\]/).pop();
    if (!baseName)
      return void 0;
    for (const ext of extensions) {
      if (baseName.endsWith(ext)) {
        return baseName.slice(0, -ext.length);
      }
    }
    const dotIdx = baseName.lastIndexOf(".");
    if (dotIdx !== -1) {
      return baseName.slice(0, dotIdx);
    }
    return baseName;
  }
  function parseColonLocation(loc) {
    if (!loc)
      return null;
    const parts = loc.split(":");
    if (parts.length >= 3) {
      const columnStr = parts.pop() || "";
      const lineStr = parts.pop() || "";
      const file = parts.join(":");
      const line = Number.parseInt(lineStr, 10);
      const column = Number.parseInt(columnStr, 10);
      return {
        fileName: file,
        lineNumber: Number.isNaN(line) ? void 0 : line,
        columnNumber: Number.isNaN(column) ? void 0 : column
      };
    }
    return null;
  }

  // ../source-resolver/dist/adapters/stackFrame.js
  var BUNDLER_OR_RUNTIME_FRAME_PATTERNS = [
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
    "node:internal"
  ];
  function stripQueryAndHash(urlOrPath) {
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
  function stripViteFsPrefix(pathname) {
    const afterFs = pathname.slice("/@fs/".length);
    if (/^[a-zA-Z]:/.test(afterFs) || afterFs.startsWith("/")) {
      return afterFs;
    }
    return "/" + afterFs;
  }
  function normalizeFileUrl(rawUrl) {
    const cleaned = stripQueryAndHash(rawUrl);
    let filePath;
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
  function normalizeStackPath(rawTarget, options = {}) {
    const trimmed = rawTarget.trim();
    if (trimmed.startsWith("file://")) {
      return {
        fileName: normalizeFileUrl(trimmed),
        isHttpUrl: false,
        hadViteFsPrefix: false
      };
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        const pathname = stripQueryAndHash(url.pathname);
        const hadViteFsPrefix2 = pathname.startsWith("/@fs/");
        let fileName;
        if (hadViteFsPrefix2) {
          fileName = stripViteFsPrefix(pathname);
        } else if (options.preserveHttpOrigin) {
          fileName = `${url.origin}${pathname}`;
        } else {
          fileName = pathname;
        }
        return {
          fileName,
          isHttpUrl: true,
          hadViteFsPrefix: hadViteFsPrefix2
        };
      } catch {
        return {
          fileName: stripQueryAndHash(trimmed),
          isHttpUrl: true,
          hadViteFsPrefix: false
        };
      }
    }
    const cleaned = stripQueryAndHash(trimmed);
    const hadViteFsPrefix = cleaned.startsWith("/@fs/");
    return {
      fileName: hadViteFsPrefix ? stripViteFsPrefix(cleaned) : cleaned,
      isHttpUrl: false,
      hadViteFsPrefix
    };
  }
  function parseV8StackLine(line, options) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at "))
      return null;
    const body = trimmed.slice(3).trim();
    if (!body)
      return null;
    let functionName;
    let rawLocation;
    if (body.endsWith(")")) {
      const sepIdx = body.indexOf(" (");
      if (sepIdx !== -1) {
        functionName = body.slice(0, sepIdx).trim() || void 0;
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
    if (!match)
      return null;
    const rawTarget = match[1].trim();
    const lineNumber = Number.parseInt(match[2], 10);
    const columnNumber = Number.parseInt(match[3], 10);
    if (!rawTarget || !Number.isInteger(lineNumber) || !Number.isInteger(columnNumber) || lineNumber < 1 || columnNumber < 1) {
      return null;
    }
    const { fileName } = normalizeStackPath(rawTarget, options);
    if (!fileName)
      return null;
    return {
      ...functionName ? { functionName } : {},
      rawLocation,
      fileName,
      lineNumber,
      columnNumber
    };
  }
  function isBundlerOrRuntimeFrame(locationOrLine) {
    const normalized = locationOrLine.replaceAll("\\", "/");
    return BUNDLER_OR_RUNTIME_FRAME_PATTERNS.some((pattern) => normalized.includes(pattern));
  }

  // ../source-resolver/dist/adapters/ReactFiberAdapter.js
  function extractComponentNameFromType(type, depth = 0) {
    if (!type || depth > 5)
      return void 0;
    if (typeof type === "function") {
      return type.displayName || type.name || void 0;
    }
    if (typeof type === "object") {
      if (typeof type.displayName === "string" && type.displayName) {
        return type.displayName;
      }
      if (type.render) {
        return extractComponentNameFromType(type.render, depth + 1);
      }
      if (type.type) {
        return extractComponentNameFromType(type.type, depth + 1);
      }
      if (typeof type.name === "string" && type.name) {
        return type.name;
      }
    }
    return void 0;
  }
  function sanitizeStackFunctionName(functionName) {
    if (!functionName)
      return void 0;
    const trimmed = functionName.trim();
    if (!trimmed || trimmed === "Object" || trimmed === "<anonymous>" || trimmed.endsWith(".<anonymous>")) {
      return void 0;
    }
    return trimmed;
  }
  var ReactFiberAdapter = class {
    name = "react-fiber";
    getFiber(element) {
      const keys = Object.keys(element);
      const fiberKey = keys.find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
      if (!fiberKey)
        return null;
      return element[fiberKey];
    }
    canResolve(element) {
      return !!this.getFiber(element);
    }
    findComponentNameFromFiber(fiber) {
      let owner = fiber?._debugOwner;
      const visitedOwners = /* @__PURE__ */ new Set();
      while (owner && !visitedOwners.has(owner)) {
        visitedOwners.add(owner);
        if (typeof owner.tag === "number" || owner.type !== void 0) {
          const name = extractComponentNameFromType(owner.type);
          if (name)
            return name;
          owner = owner._debugOwner ?? owner.owner;
        } else if (typeof owner.name === "string") {
          if (owner.name)
            return owner.name;
          owner = owner.owner ?? owner._debugOwner;
        } else {
          owner = owner._debugOwner ?? owner.owner;
        }
      }
      const ownName = extractComponentNameFromType(fiber?.type);
      if (ownName)
        return ownName;
      let current = fiber?.return;
      const visitedFibers = /* @__PURE__ */ new Set();
      while (current && !visitedFibers.has(current)) {
        visitedFibers.add(current);
        const name = extractComponentNameFromType(current.type);
        if (name)
          return name;
        current = current.return;
      }
      return void 0;
    }
    extractDebugStackLocation(debugStack) {
      const stack = debugStack?.stack;
      if (typeof stack !== "string")
        return null;
      for (const line of stack.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("Error:") || !trimmed.startsWith("at ")) {
          continue;
        }
        if (isBundlerOrRuntimeFrame(trimmed)) {
          continue;
        }
        const parsed = parseV8StackLine(trimmed, { preserveHttpOrigin: true });
        if (parsed && parsed.fileName !== "<anonymous>") {
          return parsed;
        }
      }
      return null;
    }
    resolve(element) {
      const startFiber = this.getFiber(element);
      if (!startFiber)
        return null;
      let fiber = startFiber;
      const visited = /* @__PURE__ */ new Set();
      while (fiber && !visited.has(fiber)) {
        visited.add(fiber);
        const source = fiber._debugSource;
        if (source) {
          const componentName = this.findComponentNameFromFiber(fiber);
          return {
            fileName: source.fileName,
            lineNumber: source.lineNumber,
            columnNumber: source.columnNumber,
            componentName,
            framework: "React",
            ...getElementMetadata(element)
          };
        }
        const stackFrame = this.extractDebugStackLocation(fiber._debugStack);
        if (stackFrame) {
          const componentName = this.findComponentNameFromFiber(fiber) || sanitizeStackFunctionName(stackFrame.functionName);
          return {
            fileName: stackFrame.fileName,
            lineNumber: stackFrame.lineNumber,
            columnNumber: stackFrame.columnNumber,
            componentName,
            framework: "React",
            ...getElementMetadata(element)
          };
        }
        fiber = fiber.return;
      }
      const fallbackComponentName = this.findComponentNameFromFiber(startFiber);
      if (fallbackComponentName) {
        return {
          fileName: "",
          lineNumber: 0,
          columnNumber: 0,
          componentName: fallbackComponentName,
          framework: "React",
          ...getElementMetadata(element)
        };
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/ReactInvasiveAdapter.js
  var invasiveLocs = /* @__PURE__ */ new WeakMap();
  if (globalThis.window !== void 0 && globalThis.document !== void 0) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const el2 = node;
              const loc = el2.dataset.hoversourceLoc;
              if (loc) {
                invasiveLocs.set(el2, loc);
              }
              try {
                el2.querySelectorAll("[data-hoversource-loc]").forEach((child) => {
                  if (child instanceof HTMLElement) {
                    invasiveLocs.set(child, child.dataset.hoversourceLoc);
                  }
                });
              } catch {
              }
            }
          });
        } else if (m.type === "attributes" && m.attributeName === "data-hoversource-loc") {
          const el2 = m.target;
          const loc = el2.dataset.hoversourceLoc;
          if (loc) {
            invasiveLocs.set(el2, loc);
          }
        }
      }
    });
    const scan = () => {
      try {
        document.querySelectorAll("[data-hoversource-loc]").forEach((el2) => {
          if (el2 instanceof HTMLElement) {
            invasiveLocs.set(el2, el2.dataset.hoversourceLoc);
          }
        });
      } catch {
      }
    };
    const startObserver = () => {
      scan();
      try {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-hoversource-loc"]
        });
      } catch {
      }
    };
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver);
    }
  }
  var ReactInvasiveAdapter = class {
    name = "react-invasive";
    canResolve(element) {
      return invasiveLocs.has(element) || !!(element.dataset && typeof element.dataset.hoversourceLoc === "string");
    }
    resolve(element) {
      const value = invasiveLocs.get(element) || element.dataset?.hoversourceLoc;
      if (value) {
        const parsed = parseColonLocation(value);
        if (parsed) {
          return {
            fileName: parsed.fileName,
            lineNumber: parsed.lineNumber,
            columnNumber: parsed.columnNumber,
            componentName: getComponentNameFromFile(parsed.fileName),
            framework: "React",
            ...getElementMetadata(element)
          };
        }
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/VueAdapter.js
  var VueAdapter = class {
    name = "vue";
    getVueInstance(element) {
      return element.__vueParentComponent;
    }
    resolveInvasiveFile(element, dataset) {
      const file = dataset.vInspectorFile;
      if (file) {
        const lineStr = dataset.vInspectorLine;
        const columnStr = dataset.vInspectorColumn;
        const line = lineStr ? Number.parseInt(lineStr, 10) : Number.NaN;
        const column = columnStr ? Number.parseInt(columnStr, 10) : Number.NaN;
        return {
          fileName: file,
          lineNumber: Number.isNaN(line) ? void 0 : line,
          columnNumber: Number.isNaN(column) ? void 0 : column,
          componentName: getComponentNameFromFile(file),
          framework: "Vue",
          ...getElementMetadata(element)
        };
      }
      return null;
    }
    resolveInvasiveCombined(element, dataset) {
      const value = dataset.vInspector;
      if (value) {
        const parsed = parseColonLocation(value);
        if (parsed) {
          return {
            fileName: parsed.fileName,
            lineNumber: parsed.lineNumber,
            columnNumber: parsed.columnNumber,
            componentName: getComponentNameFromFile(parsed.fileName),
            framework: "Vue",
            ...getElementMetadata(element)
          };
        }
      }
      return null;
    }
    canResolve(element) {
      if (this.getVueInstance(element))
        return true;
      return !!(element.dataset && ("vInspector" in element.dataset || "vInspectorFile" in element.dataset));
    }
    resolve(element) {
      const dataset = element.dataset;
      if (dataset) {
        if ("vInspectorFile" in dataset) {
          const res = this.resolveInvasiveFile(element, dataset);
          if (res)
            return res;
        }
        if ("vInspector" in dataset) {
          const res = this.resolveInvasiveCombined(element, dataset);
          if (res)
            return res;
        }
      }
      let instance = this.getVueInstance(element);
      while (instance) {
        const type = instance.type;
        if (type && (type.__file || type.name || type.__name)) {
          const componentName = type.name || type.__name;
          return {
            fileName: type.__file || "",
            componentName: componentName || void 0,
            framework: "Vue",
            ...getElementMetadata(element)
          };
        }
        instance = instance.parent;
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/SvelteAdapter.js
  var SvelteAdapter = class {
    name = "svelte";
    canResolve(element) {
      return !!element.__svelte_meta;
    }
    resolve(element) {
      const meta = element.__svelte_meta;
      if (!meta?.loc)
        return null;
      const { file, line, column } = meta.loc;
      return {
        fileName: file || "",
        lineNumber: typeof line === "number" ? line + 1 : void 0,
        columnNumber: typeof column === "number" ? column + 1 : void 0,
        componentName: getComponentNameFromFile(file),
        framework: "Svelte",
        ...getElementMetadata(element)
      };
    }
  };

  // ../source-resolver/dist/adapters/PreactAdapter.js
  var PreactAdapter = class {
    name = "preact";
    getVNode(element) {
      const keys = Object.keys(element);
      const vnodeKey = keys.find((key) => key.startsWith("__v") || key.startsWith("__preact"));
      if (!vnodeKey)
        return null;
      return element[vnodeKey];
    }
    canResolve(element) {
      return !!this.getVNode(element);
    }
    findComponentNameFromVNode(vnode) {
      let parent = vnode.__;
      while (parent) {
        if (parent.type && typeof parent.type === "function") {
          return parent.type.name || parent.type.displayName;
        }
        parent = parent.__;
      }
      return void 0;
    }
    resolve(element) {
      let vnode = this.getVNode(element);
      while (vnode) {
        const source = vnode.__source || vnode.props?.__source;
        if (source) {
          const componentName = this.findComponentNameFromVNode(vnode);
          return {
            fileName: source.fileName || "",
            lineNumber: source.lineNumber,
            columnNumber: source.columnNumber,
            componentName: componentName || (typeof vnode.type === "function" ? vnode.type.name : void 0),
            framework: "Preact",
            ...getElementMetadata(element)
          };
        }
        vnode = vnode.__;
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/SolidAdapter.js
  var SolidAdapter = class {
    name = "solid";
    canResolve(element) {
      return !!(element.dataset && "sourceLoc" in element.dataset);
    }
    resolve(element) {
      const loc = element.dataset?.sourceLoc;
      if (!loc)
        return null;
      const parsed = parseColonLocation(loc);
      if (parsed) {
        return {
          fileName: parsed.fileName,
          lineNumber: parsed.lineNumber,
          columnNumber: parsed.columnNumber,
          componentName: getComponentNameFromFile(parsed.fileName),
          framework: "SolidJS",
          ...getElementMetadata(element)
        };
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/AstroAdapter.js
  var AstroAdapter = class {
    name = "astro";
    canResolve(element) {
      return !!(element.dataset && "astroSourceFile" in element.dataset);
    }
    resolve(element) {
      const file = element.dataset?.astroSourceFile;
      if (!file)
        return null;
      const loc = element.dataset.astroSourceLoc;
      let line = void 0;
      let column = void 0;
      if (loc) {
        const parts = loc.split(":");
        if (parts.length === 2) {
          const l = Number.parseInt(parts[0], 10);
          const c = Number.parseInt(parts[1], 10);
          if (Number.isInteger(l))
            line = l;
          if (Number.isInteger(c))
            column = c;
        }
      }
      return {
        fileName: file,
        lineNumber: line,
        columnNumber: column,
        componentName: getComponentNameFromFile(file),
        framework: "Astro",
        ...getElementMetadata(element)
      };
    }
  };

  // ../source-resolver/dist/adapters/AngularAdapter.js
  var AngularAdapter = class {
    name = "angular";
    getNgContext(element) {
      return element.__ngContext__;
    }
    canResolve(element) {
      return !!this.getNgContext(element) || element.dataset && "ngSourceFile" in element.dataset;
    }
    resolveInvasive(element) {
      const file = element.dataset.ngSourceFile;
      if (!file)
        return null;
      const lineStr = element.dataset.ngSourceLine;
      const columnStr = element.dataset.ngSourceColumn;
      const compName = element.dataset.ngComponent;
      const line = lineStr ? Number.parseInt(lineStr, 10) : Number.NaN;
      const column = columnStr ? Number.parseInt(columnStr, 10) : Number.NaN;
      return {
        fileName: file,
        lineNumber: Number.isNaN(line) ? void 0 : line,
        columnNumber: Number.isNaN(column) ? void 0 : column,
        componentName: compName || void 0,
        framework: "Angular",
        ...getElementMetadata(element)
      };
    }
    resolve(element) {
      if (element.dataset && "ngSourceFile" in element.dataset) {
        return this.resolveInvasive(element);
      }
      const context = this.getNgContext(element);
      if (context) {
        let componentName = void 0;
        const ng = globalThis.ng;
        if (ng && typeof ng.getOwningComponent === "function") {
          try {
            const compInstance = ng.getOwningComponent(element);
            if (compInstance?.constructor) {
              componentName = compInstance.constructor.name;
            }
          } catch {
          }
        }
        return {
          fileName: "",
          // Not resolvable at runtime in non-invasive mode
          componentName,
          framework: "Angular",
          ...getElementMetadata(element)
        };
      }
      return null;
    }
  };

  // ../source-resolver/dist/adapters/VanillaAdapter.js
  function matchStaticHtmlMap(element) {
    const map = globalThis.__HOVERSOURCE_STATIC_HTML_MAP__ || (typeof window !== "undefined" ? window.__HOVERSOURCE_STATIC_HTML_MAP__ : void 0);
    if (!map || !Array.isArray(map) || map.length === 0)
      return null;
    const targetTag = element.tagName ? element.tagName.toLowerCase() : "";
    if (!targetTag)
      return null;
    const targetId = element.id || void 0;
    const targetClasses = element.classList ? Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-")) : [];
    let bestMatch = null;
    let bestScore = 0;
    for (const entry of map) {
      if (entry.tagName.toLowerCase() !== targetTag)
        continue;
      let score = 10;
      if (targetId) {
        if (entry.id === targetId) {
          score += 1e3;
        } else {
          continue;
        }
      } else if (entry.id) {
        continue;
      }
      if (targetClasses.length > 0 && entry.classList && entry.classList.length > 0) {
        let matched = 0;
        for (const cls of targetClasses) {
          if (entry.classList.includes(cls))
            matched++;
        }
        if (matched > 0) {
          score += matched * 100;
        }
      }
      if (element.attributes) {
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          if (attr.name !== "id" && attr.name !== "class" && !attr.name.startsWith("data-hs-")) {
            if (entry.attributes && entry.attributes[attr.name] === attr.value) {
              score += 200;
            }
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    return bestMatch;
  }
  var VanillaAdapter = class {
    name = "vanilla";
    canResolve(element) {
      if (typeof element?.closest === "function" && !!element.closest("[data-hs-source]")) {
        return true;
      }
      if (matchStaticHtmlMap(element)) {
        return true;
      }
      return !!element?.tagName;
    }
    resolve(element) {
      const target = typeof element?.closest === "function" ? element.closest("[data-hs-source]") : null;
      if (target) {
        const sourceAttr = target.dataset.hsSource;
        const parsed = parseColonLocation(sourceAttr);
        if (parsed) {
          return {
            fileName: parsed.fileName,
            lineNumber: parsed.lineNumber,
            columnNumber: parsed.columnNumber,
            framework: "Vanilla",
            ...getElementMetadata(element)
          };
        }
      }
      const staticMatch = matchStaticHtmlMap(element);
      if (staticMatch) {
        return {
          fileName: staticMatch.fileName,
          lineNumber: staticMatch.lineNumber,
          columnNumber: staticMatch.columnNumber,
          framework: "Vanilla",
          ...getElementMetadata(element)
        };
      }
      return {
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        framework: "Vanilla",
        ...getElementMetadata(element)
      };
    }
  };

  // ../source-resolver/dist/index.js
  var SourceResolver = class {
    adapters = [];
    fiberAdapter;
    nodeCache = /* @__PURE__ */ new WeakMap();
    constructor() {
      this.fiberAdapter = new ReactFiberAdapter();
      this.adapters.push(new ReactInvasiveAdapter(), this.fiberAdapter, new VueAdapter(), new SvelteAdapter(), new PreactAdapter(), new SolidAdapter(), new AstroAdapter(), new AngularAdapter(), new VanillaAdapter());
      this.setupMutationObserver();
    }
    setupMutationObserver() {
      if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
        const observer = new MutationObserver(() => {
          this.clearCache();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      }
    }
    clearCache() {
      this.nodeCache = /* @__PURE__ */ new WeakMap();
    }
    registerAdapter(adapter) {
      this.adapters.push(adapter);
    }
    resolve(element) {
      for (const adapter of this.adapters) {
        if (adapter.canResolve(element)) {
          try {
            const info = adapter.resolve(element);
            if (info)
              return info;
          } catch (e) {
            console.warn(`[HoverSource] Adapter ${adapter.name} failed resolving element`, e);
          }
        }
      }
      return null;
    }
    /**
     * Walks up the DOM from `element` and returns layout + source info for
     * each ancestor (up to `maxDepth` levels).
     *
     * Always resolves: selector, display, position.
     * Resolves conditionally: layoutProps (flex/grid only), fileName/lineNumber/componentName (via adapters).
     */
    resolveAncestors(element, maxDepth = 32) {
      const results = [];
      let current = element.parentElement;
      let depth = 0;
      const limit = Math.min(maxDepth, 32);
      while (current && current !== document.documentElement && depth < limit) {
        if (this.nodeCache.has(current)) {
          results.push(this.nodeCache.get(current));
          current = current.parentElement;
          depth++;
          continue;
        }
        try {
          const comp = globalThis.getComputedStyle(current);
          const display = comp.display || "block";
          const position = comp.position || "static";
          const info = {
            selector: this.buildSelector(current),
            display,
            position
          };
          if (display === "flex" || display === "inline-flex") {
            info.layoutProps = {
              "flex-direction": comp.flexDirection,
              "justify-content": comp.justifyContent,
              "align-items": comp.alignItems,
              "gap": comp.gap,
              "flex-wrap": comp.flexWrap
            };
          } else if (display === "grid" || display === "inline-grid") {
            info.layoutProps = {
              "grid-template-columns": comp.gridTemplateColumns,
              "grid-template-rows": comp.gridTemplateRows,
              "gap": comp.gap
            };
          }
          const sourceInfo = this.resolve(current);
          if (sourceInfo) {
            info.fileName = sourceInfo.fileName;
            info.lineNumber = sourceInfo.lineNumber;
            info.componentName = sourceInfo.componentName;
          }
          this.nodeCache.set(current, info);
          results.push(info);
        } catch {
        }
        current = current.parentElement;
        depth++;
      }
      return results;
    }
    buildSelector(el2) {
      const tag = el2.tagName.toLowerCase();
      const id = el2.id ? `#${el2.id}` : "";
      const classes = Array.from(el2.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
      return `${tag}${id}${classes ? "." + classes : ""}`;
    }
  };

  // src/vanillaPatch.ts
  function setupVanillaMonkeyPatch() {
    if (typeof document === "undefined")
      return;
    if (globalThis.__HOVERSOURCE_VANILLA_PATCHED__)
      return;
    globalThis.__HOVERSOURCE_VANILLA_PATCHED__ = true;
    if (typeof document.createElement === "function") {
      const originalCreateElement = document.createElement;
      document.createElement = function(tagName, options) {
        const el2 = originalCreateElement.call(this, tagName, options);
        const source = captureSourceLocation();
        if (source && el2.dataset) {
          el2.dataset.hsSource = source;
        }
        return el2;
      };
    }
    if (typeof Element !== "undefined" && Element?.prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      if (descriptor?.set) {
        const originalSet = descriptor.set;
        descriptor.set = function(html) {
          originalSet.call(this, html);
          const source = captureSourceLocation();
          if (source) {
            if (this.dataset) {
              this.dataset.hsSource = source;
            }
            if (this.children) {
              for (const child of this.children) {
                if (child.dataset) {
                  child.dataset.hsSource = source;
                }
              }
            }
          }
        };
        Object.defineProperty(Element.prototype, "innerHTML", descriptor);
      }
    }
  }
  function isOverlayFrame(line) {
    return line.includes("hoversource-overlay.js") || line.includes("overlay.bundle.js") || line.includes("captureSourceLocation") || line.includes("setupVanillaMonkeyPatch") || line.includes("createElement") || line.includes("innerHTML");
  }
  function captureSourceLocation() {
    const err = new Error();
    const stack = err.stack;
    if (!stack)
      return null;
    const lines = stack.split("\n");
    for (const line of lines) {
      if (!line.includes("at "))
        continue;
      if (isOverlayFrame(line) || isBundlerOrRuntimeFrame(line))
        continue;
      const parsed = parseV8StackLine(line);
      if (parsed) {
        const cleanFile = stripQueryAndHash(parsed.fileName);
        if (!cleanFile || cleanFile === "<anonymous>" || isBundlerOrRuntimeFrame(cleanFile)) {
          continue;
        }
        return `${cleanFile}:${parsed.lineNumber}:${parsed.columnNumber}`;
      }
    }
    return null;
  }

  // src/domReady.ts
  function waitForDomBody(timeoutMs = 1e4, signal) {
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1e4;
    if (typeof document === "undefined") {
      return Promise.resolve(false);
    }
    if (signal?.aborted) {
      return Promise.resolve(Boolean(document.body));
    }
    if (document.body) {
      return Promise.resolve(true);
    }
    if (typeof document.addEventListener !== "function") {
      return Promise.resolve(Boolean(document.body));
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer;
      let pollInterval;
      let observer = null;
      const settle = (ready) => {
        if (settled)
          return;
        settled = true;
        if (timer !== void 0) {
          clearTimeout(timer);
          timer = void 0;
        }
        if (pollInterval !== void 0) {
          clearInterval(pollInterval);
          pollInterval = void 0;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        document.removeEventListener("DOMContentLoaded", onReady);
        signal?.removeEventListener("abort", onAbort);
        resolve(ready);
      };
      const onReady = () => {
        if (document.body) {
          settle(true);
        }
      };
      const onAbort = () => {
        settle(Boolean(document.body));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      document.addEventListener("DOMContentLoaded", onReady);
      timer = setTimeout(() => {
        settle(Boolean(document.body));
      }, effectiveTimeoutMs);
      if (document.readyState !== "loading") {
        const observeRoot = document.documentElement ?? document;
        let observing = false;
        if (typeof MutationObserver !== "undefined" && observeRoot) {
          try {
            observer = new MutationObserver(() => {
              if (document.body) {
                settle(true);
              }
            });
            observer.observe(observeRoot, { childList: true });
            observing = true;
          } catch {
            observer?.disconnect();
            observer = null;
          }
        }
        if (!observing) {
          pollInterval = setInterval(() => {
            if (document.body) {
              settle(true);
            }
          }, 16);
        }
      }
    });
  }

  // src/inspector.ts
  var contextCache = /* @__PURE__ */ new WeakMap();
  var parentStyleCache = /* @__PURE__ */ new WeakMap();
  var activeObserver = null;
  var observerEpoch = 0;
  var activeObserverAbortController = null;
  function clearInspectorCache() {
    contextCache = /* @__PURE__ */ new WeakMap();
    parentStyleCache = /* @__PURE__ */ new WeakMap();
  }
  function disconnectInspectorMutationObserver() {
    ++observerEpoch;
    if (activeObserverAbortController) {
      activeObserverAbortController.abort();
      activeObserverAbortController = null;
    }
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
  }
  async function initInspectorMutationObserver(timeoutMs, signal) {
    if (activeObserverAbortController) {
      activeObserverAbortController.abort();
      activeObserverAbortController = null;
    }
    const epoch = ++observerEpoch;
    if (signal?.aborted || typeof MutationObserver === "undefined" || typeof document === "undefined") {
      return null;
    }
    const controller = new AbortController();
    activeObserverAbortController = controller;
    const onExternalAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    try {
      if (!document.body) {
        const ready = await waitForDomBody(timeoutMs, controller.signal);
        if (!ready)
          return null;
      }
      if (epoch !== observerEpoch || controller.signal.aborted || !document.body) {
        return null;
      }
      if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
      }
      const observer = new MutationObserver(() => {
        clearInspectorCache();
      });
      try {
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        activeObserver = observer;
        return observer;
      } catch {
        observer.disconnect();
        return null;
      }
    } finally {
      signal?.removeEventListener("abort", onExternalAbort);
      if (activeObserverAbortController === controller) {
        activeObserverAbortController = null;
      }
    }
  }
  function inspectLayoutConstraints(element, layoutConstraints) {
    try {
      const computed = globalThis.getComputedStyle(element);
      if (computed.position && computed.position !== "static") {
        layoutConstraints["position"] = computed.position;
      }
      if (computed.flexGrow && computed.flexGrow !== "0") {
        layoutConstraints["flex-grow"] = computed.flexGrow;
      }
      if (computed.alignSelf && computed.alignSelf !== "auto" && computed.alignSelf !== "normal") {
        layoutConstraints["align-self"] = computed.alignSelf;
      }
      if (computed.gridColumn && computed.gridColumn !== "auto") {
        layoutConstraints["grid-column"] = computed.gridColumn;
      }
      if (computed.display && computed.display !== "inline" && computed.display !== "block") {
        layoutConstraints["display"] = computed.display;
      }
      inspectScrollConstraints(element, computed, layoutConstraints);
    } catch (e) {
      console.warn("[HoverSource] Failed to compute element layout constraints", e);
    }
  }
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function parsePixelWidth(value) {
    if (!value)
      return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function isScrollOverflow(value) {
    return value === "auto" || value === "scroll" || value === "hidden" || value === "clip";
  }
  function allowsScrollbar(value) {
    return value === "auto" || value === "scroll";
  }
  function inspectScrollConstraints(element, computed, layoutConstraints) {
    const overflowX = computed.overflowX;
    const overflowY = computed.overflowY;
    const scrollbarGutter = computed.scrollbarGutter;
    const clientWidth = element.clientWidth;
    const clientHeight = element.clientHeight;
    const scrollWidth = element.scrollWidth;
    const scrollHeight = element.scrollHeight;
    const offsetWidth = element.offsetWidth;
    const offsetHeight = element.offsetHeight;
    const hasGeometry = isFiniteNumber(clientWidth) && isFiniteNumber(clientHeight) && isFiniteNumber(scrollWidth) && isFiniteNumber(scrollHeight);
    const hasVerticalOverflow = hasGeometry && scrollHeight > clientHeight + 1;
    const hasHorizontalOverflow = hasGeometry && scrollWidth > clientWidth + 1;
    if (isScrollOverflow(overflowX) || hasHorizontalOverflow) {
      layoutConstraints["overflow-x"] = overflowX || "visible";
    }
    if (isScrollOverflow(overflowY) || hasVerticalOverflow) {
      layoutConstraints["overflow-y"] = overflowY || "visible";
    }
    if (scrollbarGutter && scrollbarGutter !== "auto") {
      layoutConstraints["scrollbar-gutter"] = scrollbarGutter;
    }
    if (hasGeometry && (allowsScrollbar(overflowX) || allowsScrollbar(overflowY) || hasVerticalOverflow || hasHorizontalOverflow)) {
      layoutConstraints["client-size"] = `${clientWidth}x${clientHeight}`;
      layoutConstraints["scroll-size"] = `${scrollWidth}x${scrollHeight}`;
    }
    if (hasGeometry && (allowsScrollbar(overflowY) || allowsScrollbar(overflowX))) {
      const borderX = parsePixelWidth(computed.borderLeftWidth) + parsePixelWidth(computed.borderRightWidth);
      const borderY = parsePixelWidth(computed.borderTopWidth) + parsePixelWidth(computed.borderBottomWidth);
      const vTrack = allowsScrollbar(overflowY) && isFiniteNumber(offsetWidth) ? Math.max(0, Math.round(offsetWidth - clientWidth - borderX)) : 0;
      const hTrack = allowsScrollbar(overflowX) && isFiniteNumber(offsetHeight) ? Math.max(0, Math.round(offsetHeight - clientHeight - borderY)) : 0;
      if (hTrack > 0) {
        layoutConstraints["scrollbar-width"] = `${vTrack}px x ${hTrack}px`;
      } else if (vTrack > 0) {
        layoutConstraints["scrollbar-width"] = `${vTrack}px`;
      }
    }
  }
  function inspectVisualContext(element, maxDepth = 32) {
    if (contextCache.has(element)) {
      return contextCache.get(element);
    }
    const parentEffects = [];
    const layoutConstraints = {};
    inspectLayoutConstraints(element, layoutConstraints);
    let current = element.parentElement;
    let depth = 0;
    const limit = Math.min(maxDepth, 100);
    while (current && depth < limit) {
      const tagName = current.tagName.toLowerCase();
      if (tagName === "body" || tagName === "html") {
        break;
      }
      inspectParentElementStyle(current, parentEffects);
      current = current.parentElement;
      depth++;
    }
    const result = {
      parentEffects,
      layoutConstraints
    };
    contextCache.set(element, result);
    return result;
  }
  function checkMaskEffect(comp, tagName, classList, parentEffects, current) {
    const mask = comp.maskImage || comp.webkitMaskImage;
    if (mask && mask !== "none") {
      parentEffects.push({ tagName, classList, property: "mask-image", value: mask, element: current });
    }
  }
  function checkBackdropEffect(comp, tagName, classList, parentEffects, current) {
    const backdropFilter = comp.backdropFilter || comp.webkitBackdropFilter;
    if (backdropFilter && backdropFilter !== "none") {
      parentEffects.push({ tagName, classList, property: "backdrop-filter", value: backdropFilter, element: current });
    }
  }
  function checkFilterEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.filter && comp.filter !== "none") {
      parentEffects.push({ tagName, classList, property: "filter", value: comp.filter, element: current });
    }
  }
  function checkOpacityEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.opacity && comp.opacity !== "1" && comp.opacity !== "") {
      const opacityVal = Number.parseFloat(comp.opacity);
      if (opacityVal < 1) {
        parentEffects.push({ tagName, classList, property: "opacity", value: comp.opacity, element: current });
      }
    }
  }
  function checkOverflowEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.overflowY && (comp.overflowY === "auto" || comp.overflowY === "scroll" || comp.overflowY === "hidden")) {
      parentEffects.push({ tagName, classList, property: "overflow-y", value: comp.overflowY, element: current });
    }
    if (comp.overflowX && (comp.overflowX === "auto" || comp.overflowX === "scroll" || comp.overflowX === "hidden")) {
      parentEffects.push({ tagName, classList, property: "overflow-x", value: comp.overflowX, element: current });
    }
  }
  function checkPositionEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.position && (comp.position === "sticky" || comp.position === "fixed" || comp.position === "relative" || comp.position === "absolute")) {
      parentEffects.push({ tagName, classList, property: "position", value: comp.position, element: current });
    }
  }
  function checkDisplayEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.display && (comp.display === "flex" || comp.display === "grid")) {
      parentEffects.push({ tagName, classList, property: "display", value: comp.display, element: current });
    }
  }
  function checkTransformEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.transform && comp.transform !== "none" && comp.transform !== "") {
      parentEffects.push({ tagName, classList, property: "transform", value: comp.transform, element: current });
    }
  }
  function checkClipPathEffect(comp, tagName, classList, parentEffects, current) {
    const clipPath = comp.clipPath || comp.webkitClipPath;
    if (clipPath && clipPath !== "none" && clipPath !== "") {
      parentEffects.push({ tagName, classList, property: "clip-path", value: clipPath, element: current });
    }
  }
  function inspectParentElementStyle(current, parentEffects) {
    if (parentStyleCache.has(current)) {
      parentEffects.push(...parentStyleCache.get(current));
      return;
    }
    const effects = [];
    const tagName = current.tagName.toLowerCase();
    try {
      const comp = globalThis.getComputedStyle(current);
      const classList = Array.from(current.classList);
      checkMaskEffect(comp, tagName, classList, effects, current);
      checkBackdropEffect(comp, tagName, classList, effects, current);
      checkFilterEffect(comp, tagName, classList, effects, current);
      checkOpacityEffect(comp, tagName, classList, effects, current);
      checkOverflowEffect(comp, tagName, classList, effects, current);
      checkPositionEffect(comp, tagName, classList, effects, current);
      checkDisplayEffect(comp, tagName, classList, effects, current);
      checkTransformEffect(comp, tagName, classList, effects, current);
      checkClipPathEffect(comp, tagName, classList, effects, current);
      parentStyleCache.set(current, effects);
      parentEffects.push(...effects);
    } catch (e) {
      console.warn(`[HoverSource] Failed to compute styles for parent element <${tagName}>`, e);
    }
  }

  // src/companionTransport.ts
  function getCompanionBaseUrl() {
    const isProxy = globalThis.__HOVERSOURCE_PROXY__ === true;
    if (isProxy) {
      return "/hoversource";
    }
    const port = globalThis.__HOVERSOURCE_PORT__ ?? 7300;
    return `http://127.0.0.1:${port}`;
  }
  var pendingBridgeRequests = /* @__PURE__ */ new Map();
  var bridgeSeq = 0;
  var bridgeInstanceNonce = null;
  function getBridgeInstanceNonce() {
    if (bridgeInstanceNonce)
      return bridgeInstanceNonce;
    const cryptoObj = globalThis.crypto;
    if (typeof cryptoObj?.randomUUID === "function") {
      bridgeInstanceNonce = cryptoObj.randomUUID();
      return bridgeInstanceNonce;
    }
    if (typeof cryptoObj?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bridgeInstanceNonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return bridgeInstanceNonce;
    }
    throw new Error("CSPRNG unavailable for companion bridge nonce");
  }
  function ensureBridgeHandlers() {
    const g = globalThis;
    if (typeof g.__hoversourceBridgeResolve !== "function") {
      g.__hoversourceBridgeResolve = (id, payloadJson) => {
        const key = String(id);
        const entry = pendingBridgeRequests.get(key);
        if (!entry)
          return;
        pendingBridgeRequests.delete(key);
        entry.cleanup();
        try {
          const parsed = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson;
          entry.resolve(parsed);
        } catch (err) {
          entry.reject(
            new Error(`Failed to parse companion bridge response for ${entry.method} ${entry.path}`, {
              cause: err
            })
          );
        }
      };
    }
    if (typeof g.__hoversourceBridgeReject !== "function") {
      g.__hoversourceBridgeReject = (id, errMsg) => {
        const key = String(id);
        const entry = pendingBridgeRequests.get(key);
        if (!entry)
          return;
        pendingBridgeRequests.delete(key);
        entry.cleanup();
        entry.reject(
          errMsg instanceof Error ? errMsg : new Error(
            typeof errMsg === "string" && errMsg ? errMsg : `Companion bridge request ${entry.method} ${entry.path} failed`
          )
        );
      };
    }
  }
  function companionBridgeRequestJson(bridgeCall, method, path, body, timeoutMs, signal) {
    ensureBridgeHandlers();
    const id = `${getBridgeInstanceNonce()}:${++bridgeSeq}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const cleanup = () => {
        if (timer !== void 0) {
          clearTimeout(timer);
          timer = void 0;
        }
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        if (settled)
          return;
        settled = true;
        pendingBridgeRequests.delete(id);
        cleanup();
        const reason = signal?.reason;
        reject(
          reason instanceof Error ? reason : new Error(`Companion bridge request ${method} ${path} aborted`)
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        if (settled)
          return;
        settled = true;
        pendingBridgeRequests.delete(id);
        cleanup();
        reject(new Error(`Companion bridge request ${method} ${path} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pendingBridgeRequests.set(id, {
        method,
        path,
        resolve: (val) => {
          if (settled)
            return;
          settled = true;
          resolve(val);
        },
        reject: (err) => {
          if (settled)
            return;
          settled = true;
          reject(err);
        },
        cleanup
      });
      const payload = {
        id,
        method: method === "POST" ? "POST" : "GET",
        path,
        ...body !== void 0 ? { body } : {}
      };
      try {
        bridgeCall(JSON.stringify(payload));
      } catch (err) {
        if (!settled) {
          settled = true;
          pendingBridgeRequests.delete(id);
          cleanup();
          reject(err);
        }
      }
    });
  }
  async function companionRequestJson(path, init) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (init?.signal?.aborted) {
      throw init.signal.reason instanceof Error ? init.signal.reason : new Error(`Companion request ${method} ${path} aborted`);
    }
    const timeoutMs = Number.isFinite(init?.timeoutMs) && init.timeoutMs > 0 ? init.timeoutMs : 5e3;
    const bridgeCall = globalThis.__hoversourceBridgeCall;
    if (typeof bridgeCall === "function") {
      return companionBridgeRequestJson(
        bridgeCall,
        method,
        path,
        init?.body,
        timeoutMs,
        init?.signal
      );
    }
    const url = `${getCompanionBaseUrl()}${path}`;
    const timeoutController = new AbortController();
    const onAbort = () => {
      const reason = init?.signal?.reason;
      timeoutController.abort(
        reason instanceof Error ? reason : new Error(`Companion request ${method} ${path} aborted`)
      );
    };
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      const err = new Error(`Companion request ${method} ${path} timed out after ${timeoutMs}ms`);
      timeoutController.abort(err);
    }, timeoutMs);
    let onTimeoutAbort;
    const abortPromise = new Promise((_resolve, reject) => {
      onTimeoutAbort = () => {
        const reason = timeoutController.signal.reason;
        reject(
          reason instanceof Error ? reason : new Error(`Companion request ${method} ${path} aborted`, { cause: reason })
        );
      };
      timeoutController.signal.addEventListener("abort", onTimeoutAbort, { once: true });
    });
    const fetchPromise = Promise.resolve().then(async () => {
      const res = await fetch(url, {
        method,
        headers: init?.headers,
        body: init?.body,
        signal: timeoutController.signal
      });
      if (!res.ok) {
        throw new Error(`Companion HTTP ${method} ${path} failed with status ${res.status}`);
      }
      return await res.json();
    });
    fetchPromise.catch(() => {
    });
    try {
      return await Promise.race([fetchPromise, abortPromise]);
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onAbort);
      if (onTimeoutAbort) {
        timeoutController.signal.removeEventListener("abort", onTimeoutAbort);
      }
    }
  }

  // src/safeDom.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var MAX_DEPTH = 64;
  var VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
  var VALID_ATTR_NAME = /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/;
  var REJECTED_TAGS = /* @__PURE__ */ new Set([
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
    "animatemotion"
  ]);
  var BODY_DISCARD_TAGS = /* @__PURE__ */ new Set(["script", "style"]);
  var VOID_TAGS = /* @__PURE__ */ new Set([
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
    "wbr"
  ]);
  var SVG_ELEMENT_TAGS = /* @__PURE__ */ new Set([
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
    "marker"
  ]);
  var URL_ATTRS = /* @__PURE__ */ new Set(["href", "src", "xlink:href", "action", "formaction"]);
  var NAMED_ENTITIES = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    apos: "'"
  };
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function decodeHtmlEntitiesOnce(input) {
    return input.replace(/&(?:(lt|gt|amp|quot|apos)|#(\d+)|#[xX]([0-9a-fA-F]+));/g, (full, named, dec, hex) => {
      if (named) {
        return NAMED_ENTITIES[named] ?? full;
      }
      const codePoint = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 1114111) {
        return "\uFFFD";
      }
      if (codePoint >= 55296 && codePoint <= 57343) {
        return "\uFFFD";
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
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
        } else {
          const valStart = i;
          while (i < len && !/[\s>]/.test(attrSource[i])) {
            i++;
          }
          rawValue = attrSource.slice(valStart, i);
        }
        setSanitizedAttribute(target, attrName, rawValue);
      } else {
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
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
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
  function createSafeFragmentFromHtml(html) {
    const fragment = document.createDocumentFragment();
    if (!html) {
      return fragment;
    }
    const stack = [
      { node: fragment, tagLower: "#fragment", inSvg: false }
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
      if (html.startsWith("<!--", ltIndex)) {
        const commentEnd = html.indexOf("-->", ltIndex + 4);
        pos = commentEnd === -1 ? len : commentEnd + 3;
        continue;
      }
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
      const tagClose = findTagClose(html, ltIndex + 1);
      if (tagClose === -1) {
        const rem = html.slice(ltIndex + 1);
        const nameMatch2 = rem.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/>]|$)/);
        if (nameMatch2 && BODY_DISCARD_TAGS.has(nameMatch2[1].toLowerCase())) {
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
      if (REJECTED_TAGS.has(tagLower)) {
        if (BODY_DISCARD_TAGS.has(tagLower) && !isSelfClosing) {
          pos = findClosingBodyTagEnd(html, tagClose + 1, tagLower);
        } else {
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
          inSvg: isSvgElement
        });
      }
      pos = tagClose + 1;
    }
    return fragment;
  }
  function setElementContentSafely(el2, html) {
    const fragment = createSafeFragmentFromHtml(html);
    el2.replaceChildren(fragment);
  }
  function el(tag, attrs, children) {
    if (!VALID_TAG_NAME.test(tag)) {
      return null;
    }
    const tagLower = tag.toLowerCase();
    if (REJECTED_TAGS.has(tagLower)) {
      return null;
    }
    const element = SVG_ELEMENT_TAGS.has(tagLower) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === void 0 || value === false) {
          continue;
        }
        if (value === true) {
          setSanitizedAttribute(element, key, "");
        } else {
          setSanitizedAttribute(element, key, String(value));
        }
      }
    }
    if (children) {
      for (const child of children) {
        if (child === null || child === void 0 || child === false || child === true) {
          continue;
        }
        if (typeof child === "object" && "nodeType" in child) {
          element.appendChild(child);
        } else {
          element.appendChild(document.createTextNode(String(child)));
        }
      }
    }
    return element;
  }

  // src/shortcuts.ts
  var DEFAULT_SHORTCUTS = {
    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true, metaKey: false },
    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFilterPanel: { key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false }
  };
  var DEFAULT_LAYER_SCROLL_MODIFIERS = {
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false
  };
  function isMacPlatform() {
    if (typeof navigator === "undefined")
      return false;
    const nav = navigator;
    const platform = nav.userAgentData?.platform || navigator.platform || "";
    return /mac/i.test(platform);
  }
  function formatModifierLabel(mods, isMac = isMacPlatform()) {
    if (!mods)
      return "";
    const parts = [];
    if (isMac) {
      if (mods.ctrlKey)
        parts.push("\u2303");
      if (mods.altKey)
        parts.push("\u2325");
      if (mods.shiftKey)
        parts.push("\u21E7");
      if (mods.metaKey)
        parts.push("\u2318");
      return parts.join("");
    }
    if (mods.ctrlKey)
      parts.push("Ctrl");
    if (mods.altKey)
      parts.push("Alt");
    if (mods.shiftKey)
      parts.push("Shift");
    if (mods.metaKey)
      parts.push("Win");
    return parts.join("+");
  }
  function formatShortcutLabel(shortcut, isMac = isMacPlatform()) {
    if (!shortcut?.key)
      return "";
    const modLabel = formatModifierLabel(shortcut, isMac);
    const keyLabel = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
    if (!modLabel)
      return keyLabel;
    return isMac ? `${modLabel}${keyLabel}` : `${modLabel}+${keyLabel}`;
  }
  function matchShortcut(e, shortcut) {
    if (!shortcut?.key)
      return false;
    if (!!e.altKey !== !!shortcut.altKey || !!e.ctrlKey !== !!shortcut.ctrlKey || !!e.shiftKey !== !!shortcut.shiftKey || !!e.metaKey !== !!shortcut.metaKey) {
      return false;
    }
    const targetKey = shortcut.key.toLowerCase();
    const keyMatch = typeof e.key === "string" && e.key.toLowerCase() === targetKey;
    const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
    const codeMatch = code.length > 0 && (code === targetKey || code === `key${targetKey}` || code === `digit${targetKey}`);
    return keyMatch || !!codeMatch;
  }
  function matchScrollModifiers(e, mods) {
    if (!mods)
      return false;
    return !!e.altKey === !!mods.altKey && !!e.ctrlKey === !!mods.ctrlKey && !!e.shiftKey === !!mods.shiftKey && !!e.metaKey === !!mods.metaKey;
  }

  // src/modes/InspectorAdapter.ts
  var InspectorAdapter = class {
    id = "inspector";
    controller;
    resolver = new SourceResolver();
    isFrozen = false;
    minimalMode = false;
    currentElement = null;
    currentSourceInfo = null;
    debounceTimer = null;
    maxTraversalDepth = 32;
    lastPointerEvent = null;
    // --- Layer Picker state ---
    layerStack = [];
    activeLayerIndex = 0;
    layerPickerEnabled = true;
    layerScrollModifiers = { ...DEFAULT_LAYER_SCROLL_MODIFIERS };
    activate(controller) {
      this.controller = controller;
      const config = this.controller.getConfig();
      this.minimalMode = !!config?.minimalModeByDefault;
      this.layerPickerEnabled = config?.layerPickerEnabled !== false;
      this.layerScrollModifiers = config?.layerPickerScroll ?? { ...DEFAULT_LAYER_SCROLL_MODIFIERS };
      this.maxTraversalDepth = config?.maxTraversalDepth ?? 32;
      if (this.layerPickerEnabled) {
        window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
      }
      console.log("[HoverSource] Activated Inspector Mode");
    }
    deactivate() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.controller.clear();
      this.currentElement = null;
      this.currentSourceInfo = null;
      this.layerStack = [];
      this.activeLayerIndex = 0;
      window.removeEventListener("wheel", this.handleAltScroll, { capture: true });
      if (this.isFrozen) {
        this.isFrozen = false;
        this.controller.setFreezeMode(false);
      }
    }
    onScroll() {
      if (this.currentElement) {
        this.controller.drawHighlight(this.currentElement, this.isFrozen);
        if (this.lastPointerEvent) {
          this.renderTooltip(this.lastPointerEvent);
        }
      }
    }
    onPointerOver(event, target) {
      this.lastPointerEvent = event;
      const rawStack = document.elementsFromPoint(event.clientX, event.clientY);
      const container = this.controller.container;
      const shadowHost = this.controller.shadowHost;
      this.layerStack = rawStack.filter((el2) => {
        if (el2 === document.documentElement || el2 === document.body)
          return false;
        if (shadowHost && (el2 === shadowHost || shadowHost.contains(el2)))
          return false;
        if (container && (el2 === container || container.contains(el2)))
          return false;
        return true;
      }).slice(0, this.maxTraversalDepth);
      this.activeLayerIndex = 0;
      this.resolveAndShowLayer(this.activeLayerIndex, event);
    }
    onPointerMove(event) {
      this.lastPointerEvent = event;
      if (!this.currentElement)
        return;
      const activeEl = this.layerStack[this.activeLayerIndex];
      if (activeEl && this.activeLayerIndex > 0) {
        const rect = activeEl.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) {
          this.activeLayerIndex = 0;
          this.resolveAndShowLayer(0, event);
          return;
        }
      }
      if (this.currentSourceInfo && this.controller.isUIVisible()) {
        this.controller.drawTooltip("", event);
        const tooltipBox = this.controller.tooltipBox;
        if (tooltipBox && this.currentSourceInfo.visualContext) {
          const parentItems = tooltipBox.querySelectorAll(".hoversource-parent-item");
          const activeItems = [];
          parentItems.forEach((item) => {
            if (item.classList.contains("hs-parent-active")) {
              const idxStr = item.dataset.index;
              if (idxStr !== void 0) {
                const idx = Number.parseInt(idxStr, 10);
                const fx = this.currentSourceInfo.visualContext.parentEffects[idx];
                if (fx?.element) {
                  activeItems.push({ item, fx });
                }
              }
            }
          });
          if (activeItems.length > 0) {
            this.controller.clearParentHighlights();
            activeItems.forEach(({ item, fx }) => {
              const rowRect = item.getBoundingClientRect();
              this.controller.drawParentHighlight(fx, rowRect);
            });
          }
        }
      }
    }
    onShortcut(command) {
      if (command === "toggleFreeze") {
        this.isFrozen = !this.isFrozen;
        this.controller.setFreezeMode(this.isFrozen);
        console.log(`[HoverSource] Freeze: ${this.isFrozen}`);
        if (this.isFrozen && this.currentElement) {
          this.flushResolve(this.currentElement, { clientX: 0, clientY: 0 });
        } else {
          this.renderTooltip({ clientX: 0, clientY: 0 });
        }
      } else if (command === "toggleMinimal") {
        this.minimalMode = !this.minimalMode;
        console.log(`[HoverSource] Minimal Mode: ${this.minimalMode}`);
        this.renderTooltip({ clientX: 0, clientY: 0 });
      } else if (command === "copyMetadata") {
        this.copyMetadata();
      } else if (command === "copyAllLayers") {
        this.copyAllLayers();
      }
    }
    onConfigUpdate(newConfig) {
      if (newConfig?.minimalModeByDefault !== void 0) {
        this.minimalMode = !!newConfig.minimalModeByDefault;
      }
      this.maxTraversalDepth = newConfig?.maxTraversalDepth ?? 32;
      const newEnabled = newConfig?.layerPickerEnabled !== false;
      if (newEnabled !== this.layerPickerEnabled) {
        this.layerPickerEnabled = newEnabled;
        if (newEnabled) {
          window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
        } else {
          window.removeEventListener("wheel", this.handleAltScroll, { capture: true });
        }
      }
      this.layerScrollModifiers = newConfig?.layerPickerScroll ?? this.layerScrollModifiers;
      if (this.currentElement && this.currentSourceInfo && this.controller.isUIVisible()) {
        this.renderTooltip({ clientX: 0, clientY: 0 });
      }
    }
    onUIVisibilityChanged(visible) {
    }
    handleAltScroll = (e) => {
      if (!matchScrollModifiers(e, this.layerScrollModifiers))
        return;
      if (this.layerStack.length === 0)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.activeLayerIndex = (this.activeLayerIndex + dir + this.layerStack.length) % this.layerStack.length;
      this.resolveAndShowLayer(this.activeLayerIndex, { clientX: e.clientX, clientY: e.clientY });
    };
    resolveAndShowLayer(index, event) {
      const target = this.layerStack[index];
      if (!target) {
        this.controller.clear();
        this.currentElement = null;
        this.currentSourceInfo = null;
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        return;
      }
      this.currentElement = target;
      if (this.controller.isUIVisible()) {
        this.controller.drawHighlight(target, this.isFrozen);
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.currentElement !== target)
          return;
        this.flushResolve(target, event);
      }, 50);
    }
    flushResolve(target, event) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      const info = this.resolver.resolve(target) || {
        componentName: target.tagName.toLowerCase(),
        tagName: target.tagName.toLowerCase(),
        framework: "Vanilla",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(target.classList),
        visualContext: null,
        staticMetadata: null
      };
      info.visualContext = inspectVisualContext(target, this.maxTraversalDepth);
      this.currentSourceInfo = info;
      if (this.controller.isUIVisible()) {
        this.renderTooltip(event);
      }
      if (info.fileName) {
        this.fetchBackgroundValidation(info, target, event);
      } else {
        this.fetchStaticHtmlResolution(info, target, event);
      }
    }
    fetchBackgroundValidation(info, target, e) {
      const validatePath = `/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
      companionRequestJson(validatePath).then((data) => {
        if (this.currentElement === target) {
          let line = info.lineNumber || 1;
          let col = info.columnNumber || 1;
          if (data?.corrected) {
            line = data.corrected.line;
            col = data.corrected.column;
          }
          if (data?.correctedFile) {
            info.fileName = data.correctedFile;
          }
          info.lineNumber = line;
          info.columnNumber = col;
          this.fetchStaticContextForElement(info, target, e, line, col);
        }
      }).catch((err) => console.warn("[HoverSource] Background line validation failed:", err));
    }
    fetchStaticHtmlResolution(info, target, e) {
      const tagName = info.tagName || target.tagName.toLowerCase();
      const id = target.id || "";
      const classList = (info.classList || []).join(",");
      const attrs = {};
      if (target.attributes) {
        for (let i = 0; i < target.attributes.length; i++) {
          const attr = target.attributes[i];
          if (attr.name !== "id" && attr.name !== "class" && !attr.name.startsWith("data-hs-")) {
            attrs[attr.name] = attr.value;
          }
        }
      }
      const queryParams = new URLSearchParams({
        tagName,
        id,
        classList,
        attributes: JSON.stringify(attrs)
      });
      const resolvePath = `/resolve-html-element?${queryParams.toString()}`;
      companionRequestJson(resolvePath).then((data) => {
        if (this.currentElement === target && data?.success && data?.fileName) {
          info.fileName = data.fileName;
          info.lineNumber = data.lineNumber;
          info.columnNumber = data.columnNumber;
          info.framework = data.framework || "Vanilla";
          if (this.controller.isUIVisible()) {
            this.renderTooltip(e);
          }
          this.fetchStaticContextForElement(info, target, e, info.lineNumber, info.columnNumber);
        }
      }).catch(() => {
      });
    }
    fetchStaticContextForElement(info, target, e, line, col) {
      const classesToResolve = /* @__PURE__ */ new Set();
      if (info.visualContext) {
        info.visualContext.parentEffects.forEach((fx) => {
          fx.classList.forEach((cls) => classesToResolve.add(cls));
        });
      }
      if (info.classList) {
        info.classList.forEach((cls) => classesToResolve.add(cls));
      }
      const classListParam = Array.from(classesToResolve).join(",");
      const staticContextPath = `/static-context?file=${encodeURIComponent(info.fileName)}&line=${line}&column=${col}&tagName=${encodeURIComponent(info.componentName || info.tagName || "")}&classList=${encodeURIComponent(classListParam)}`;
      companionRequestJson(staticContextPath).then((staticData) => {
        if (staticData && this.currentElement === target) {
          info.staticMetadata = staticData;
          this.currentSourceInfo = info;
          if (this.controller.isUIVisible()) {
            this.renderTooltip(e);
          }
        }
      }).catch((err) => console.warn("[HoverSource] Static context fetch failed:", err));
    }
    renderMinimalTooltip(element, info, labels) {
      const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, filterLabel, uiLabel, scrollLabel, dbLabel, modeLabel } = labels;
      const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${filterLabel} for Filters | ${uiLabel} to Hide/Show | ${scrollLabel} for Layers | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${escapeHtml(part.trim())}</span>`).join(" | ");
      let vueHint = "";
      if (info.framework === "Vue" && !info.lineNumber) {
        vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
      }
      const fileBase = info.fileName.split("/").pop().split("\\").pop();
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${escapeHtml(info.componentName || element.tagName.toLowerCase())}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${escapeHtml(info.framework)}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span
          class="hoversource-link"
          data-hs-open-file="${escapeHtml(info.fileName)}"
          data-hs-open-line="${info.lineNumber || 1}"
          data-hs-open-col="${info.columnNumber || 1}"
          data-hs-open-tag="${escapeHtml(info.tagName || "")}"
          data-hs-open-classes="${escapeHtml((info.classList || []).join(","))}"
        >
          ${escapeHtml(fileBase)}${info.lineNumber ? `:${info.lineNumber}` : ""}
        </span>
      </div>
      ${vueHint}
      <div class="hoversource-shortcut-hint">
        ${hintHtml}
      </div>
    `;
    }
    renderBasicStats(element, info, computed) {
      const width = element.offsetWidth || element.clientWidth;
      const height = element.offsetHeight || element.clientHeight;
      const color = computed.color;
      const bgColor = computed.backgroundColor;
      const tagName = element.tagName.toLowerCase();
      const classList = Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const elementSelector = `${tagName}${classStr}`;
      let selectorHtml = `<span class="hoversource-value">${escapeHtml(elementSelector)}</span>`;
      if (info.staticMetadata?.classOrigins) {
        const originParts = [];
        for (const cls of classList) {
          const origin = info.staticMetadata.classOrigins[cls];
          if (origin) {
            const fileBase2 = origin.file.split("/").pop().split("\\").pop();
            originParts.push(`<span style="color: #6b7280; font-size: 9px;">[${escapeHtml(fileBase2)}:${escapeHtml(origin.line)}]</span>`);
          }
        }
        if (originParts.length > 0) {
          selectorHtml += ` \u2794 ${originParts.join(" ")}`;
        }
      }
      const fileBase = info.fileName.split("/").pop().split("\\").pop();
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${escapeHtml(info.componentName || element.tagName.toLowerCase())}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${escapeHtml(info.framework)}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Element: </span>
        ${selectorHtml}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span
          class="hoversource-link"
          data-hs-open-file="${escapeHtml(info.fileName)}"
          data-hs-open-line="${info.lineNumber || 1}"
          data-hs-open-col="${info.columnNumber || 1}"
          data-hs-open-tag="${escapeHtml(info.tagName || "")}"
          data-hs-open-classes="${escapeHtml((info.classList || []).join(","))}"
        >
          ${escapeHtml(fileBase)}${info.lineNumber ? `:${info.lineNumber}` : ""}
        </span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Path: </span>
        <span class="hoversource-value">${escapeHtml(info.fileName)}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Size: </span>
        <span class="hoversource-value">${width}px \xD7 ${height}px</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Color: </span>
        <span class="hoversource-value">${escapeHtml(color)}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Background: </span>
        <span class="hoversource-value">${escapeHtml(bgColor)}</span>
      </div>
    `;
    }
    renderVisualDetails(shadow, animation, info) {
      let html = "";
      if (shadow && shadow !== "none") {
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Shadow: </span>
          <span class="hoversource-value">${escapeHtml(shadow)}</span>
        </div>
      `;
      }
      if (animation) {
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Animation: </span>
          <span class="hoversource-value">${escapeHtml(animation)}</span>
        </div>
      `;
      }
      if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
        const constraints = Object.entries(info.visualContext.layoutConstraints).map(([prop, val]) => `${prop}: ${val}`).join(", ");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Layout: </span>
          <span class="hoversource-value">${escapeHtml(constraints)}</span>
        </div>
      `;
      }
      return html;
    }
    renderParentEffects(info) {
      if (!info.visualContext || info.visualContext.parentEffects.length === 0) {
        return "";
      }
      const effectsHtml = info.visualContext.parentEffects.map((fx, idx) => {
        const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
        let originLabel = "";
        if (info.staticMetadata?.classOrigins) {
          for (const cls of fx.classList) {
            const origin = info.staticMetadata.classOrigins[cls];
            if (origin) {
              const fileBase = origin.file.split("/").pop();
              originLabel = ` <span style="color: #6b7280; font-size: 9px;">[${escapeHtml(fileBase)}:${escapeHtml(origin.line)}]</span>`;
              break;
            }
          }
        }
        const isVisual = fx.property === "mask-image" || fx.property === "clip-path" || fx.property.startsWith("overflow");
        const cursorStyle = isVisual ? "cursor: pointer;" : "cursor: default;";
        const hoverClass = isVisual ? " hoversource-parent-item" : "";
        return `<div class="hoversource-stack-item${hoverClass}" data-index="${idx}" style="${cursorStyle}">${escapeHtml(fx.tagName)}${escapeHtml(classStr)}${originLabel} \u2794 ${escapeHtml(fx.property)}: ${escapeHtml(fx.value)}</div>`;
      }).join("");
      return `
      <div class="hoversource-section">
        <span class="hoversource-label">Parent Styles: </span>
        <div class="hoversource-stack">
          ${effectsHtml}
        </div>
      </div>
    `;
    }
    renderStaticMetadata(info) {
      if (!info.staticMetadata)
        return "";
      let html = "";
      if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
        const commentsHtml = info.staticMetadata.comments.map((c) => `<div class="hoversource-stack-item" style="color: #6b7280; font-style: italic;">${escapeHtml(c)}</div>`).join("");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Source Comments: </span>
          <div class="hoversource-stack">
            ${commentsHtml}
          </div>
        </div>
      `;
      }
      if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
        const attrs = Object.entries(info.staticMetadata.rawAttributes).map(([k, v]) => `${escapeHtml(k)}="${escapeHtml(v)}"`).join(" ");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Source Attributes: </span>
          <span class="hoversource-value">${attrs}</span>
        </div>
      `;
      }
      return html;
    }
    renderDetailedTooltip(element, info, labels) {
      const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, filterLabel, uiLabel, scrollLabel, dbLabel, modeLabel } = labels;
      const computed = globalThis.getComputedStyle(element);
      const shadow = computed.boxShadow;
      const animation = computed.animationName === "none" ? null : `${computed.animationName} ${computed.animationDuration}`;
      const stack = [];
      let current = element;
      while (current && stack.length < 5) {
        const elInfo = this.resolver.resolve(current);
        if (elInfo?.componentName) {
          stack.push(elInfo.componentName);
        } else {
          const classStr = current.className && typeof current.className === "string" ? `.${Array.from(current.classList).join(".")}` : "";
          stack.push(`${current.tagName.toLowerCase()}${classStr}`);
        }
        current = current.parentElement;
      }
      let html = this.renderBasicStats(element, info, computed);
      html += this.renderVisualDetails(shadow, animation, info);
      html += this.renderParentEffects(info);
      html += this.renderStaticMetadata(info);
      const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Minimal | ${filterLabel} for Filters | ${uiLabel} to Hide/Show | ${scrollLabel} for Layers | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${escapeHtml(part.trim())}</span>`).join(" | ");
      let vueHint = "";
      if (info.framework === "Vue" && !info.lineNumber) {
        vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
      }
      html += `
      <div class="hoversource-section">
        <span class="hoversource-label">Stack: </span>
        <div class="hoversource-stack">
          ${stack.map((item) => `<div class="hoversource-stack-item">${escapeHtml(item)}</div>`).join("")}
        </div>
      </div>
      ${vueHint}
      <div class="hoversource-shortcut-hint">
        ${hintHtml}
      </div>
    `;
      return html;
    }
    renderTooltip(e) {
      if (!this.currentElement || !this.currentSourceInfo)
        return;
      const element = this.currentElement;
      const info = this.currentSourceInfo;
      const config = this.controller.getConfig();
      const shortcuts = config?.shortcuts;
      const isMac = isMacPlatform();
      const copyLabel = formatShortcutLabel(shortcuts?.copyMetadata ?? DEFAULT_SHORTCUTS.copyMetadata, isMac);
      const copyAllLabel = formatShortcutLabel(shortcuts?.copyAllLayers ?? DEFAULT_SHORTCUTS.copyAllLayers, isMac);
      const minimalLabel = formatShortcutLabel(shortcuts?.toggleMinimal ?? DEFAULT_SHORTCUTS.toggleMinimal, isMac);
      const freezeLabel = formatShortcutLabel(shortcuts?.toggleFreeze ?? DEFAULT_SHORTCUTS.toggleFreeze, isMac);
      const filterLabel = formatShortcutLabel(shortcuts?.toggleFilterPanel ?? DEFAULT_SHORTCUTS.toggleFilterPanel, isMac);
      const uiLabel = formatShortcutLabel(shortcuts?.toggleUI ?? DEFAULT_SHORTCUTS.toggleUI, isMac);
      const dbLabel = formatShortcutLabel(shortcuts?.openDashboard ?? DEFAULT_SHORTCUTS.openDashboard, isMac);
      const modeLabel = formatShortcutLabel(shortcuts?.toggleMode ?? DEFAULT_SHORTCUTS.toggleMode, isMac);
      const scrollModLabel = formatModifierLabel(this.layerScrollModifiers, isMac);
      const scrollLabel = scrollModLabel ? `${scrollModLabel}+Scroll` : "Scroll";
      const topLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2z" /></svg>`;
      const chevronLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M112.1 154.4L276.4 230.3C304.1 243.1 336 243.1 363.7 230.3L528 154.4L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L112.1 154.4z" /></svg>`;
      const layerDots = this.layerStack.map((el2, i) => {
        const isActive = i === this.activeLayerIndex;
        const tag = el2.tagName.toLowerCase();
        const cls = Array.from(el2.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-")).slice(0, 2).join(".");
        const label = cls ? `${tag}.${cls}` : tag;
        const zIndex = this.layerStack.length - i;
        const svgContent = i === 0 ? topLayerSvg : chevronLayerSvg;
        return `<div class="hs-layer-dot${isActive ? " hs-layer-dot--active" : ""}" style="z-index: ${zIndex}" title="Layer ${i + 1}: ${escapeHtml(label)}">${svgContent}</div>`;
      }).join("");
      const layerHint = this.layerStack.length > 1 ? `<div class="hs-layer-hint">${escapeHtml(scrollLabel)}</div>` : "";
      const layerColumnHtml = `<div class="hs-layer-column">${layerDots}${layerHint}</div>`;
      const labels = { copyLabel, copyAllLabel, freezeLabel, minimalLabel, filterLabel, uiLabel, scrollLabel, dbLabel, modeLabel };
      const innerHtml = this.minimalMode ? this.renderMinimalTooltip(element, info, labels) : this.renderDetailedTooltip(element, info, labels);
      const html = `<div class="hs-tooltip-content-wrapper"><div style="flex:1;min-width:0">${innerHtml}</div>${layerColumnHtml}</div>`;
      this.controller.drawTooltip(html, e);
      const tooltipBox = this.controller.tooltipBox;
      if (tooltipBox) {
        const parentItems = tooltipBox.querySelectorAll(".hoversource-parent-item");
        const drawDefaultHighlights = () => {
          this.controller.clearParentHighlights();
          parentItems.forEach((item) => {
            const idxStr = item.dataset.index;
            if (idxStr !== void 0) {
              const idx = Number.parseInt(idxStr, 10);
              const fx = info.visualContext?.parentEffects[idx];
              const shouldHighlight = fx?.element && (fx.property === "mask-image" || fx.property === "clip-path");
              if (shouldHighlight) {
                const rowRect = item.getBoundingClientRect();
                this.controller.drawParentHighlight(fx, rowRect);
                item.classList.add("hs-parent-active");
              } else {
                item.classList.remove("hs-parent-active");
              }
            }
          });
        };
        drawDefaultHighlights();
        parentItems.forEach((item) => {
          item.addEventListener("mouseenter", () => {
            const idxStr = item.dataset.index;
            if (idxStr !== void 0) {
              const idx = Number.parseInt(idxStr, 10);
              const fx = info.visualContext?.parentEffects[idx];
              if (fx?.element) {
                const rowRect = item.getBoundingClientRect();
                parentItems.forEach((el2) => el2.classList.remove("hs-parent-active"));
                item.classList.add("hs-parent-active");
                this.controller.clearParentHighlights();
                this.controller.drawParentHighlight(fx, rowRect);
              }
            }
          });
          item.addEventListener("mouseleave", () => {
            drawDefaultHighlights();
          });
        });
      }
    }
    formatSelectorLabel(tagName, classList, classOrigins) {
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const elementSelector = `${tagName}${classStr}`;
      let label = `\`${elementSelector}\``;
      if (classOrigins) {
        const originList = [];
        for (const cls of classList) {
          const origin = classOrigins[cls];
          if (origin) {
            originList.push(`[Source: \`${origin.file}\` (Line: \`${origin.line}\`, Column: \`${origin.column}\`)]`);
          }
        }
        if (originList.length > 0) {
          label += ` \u2794 ${originList.join(" ")}`;
        }
      }
      return label;
    }
    formatParentStyles(parentEffects, classOrigins) {
      return parentEffects.map((fx) => {
        const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
        let originLabel = "";
        if (classOrigins) {
          for (const cls of fx.classList) {
            const origin = classOrigins[cls];
            if (origin) {
              originLabel = ` \u2794 [Source: \`${origin.file}\` (Line: ${origin.line}, Column: ${origin.column})]`;
              break;
            }
          }
        }
        return `  - \`${fx.tagName}${classStr}\` \u2794 \`${fx.property}: ${fx.value}\`${originLabel}`;
      }).join("\n");
    }
    formatLayoutConstraints(layoutConstraints) {
      return Object.entries(layoutConstraints).map(([k, v]) => `  - \`${k}: ${v}\``).join("\n");
    }
    formatSourceComments(comments) {
      return comments.map((c) => `  - \`${c}\``).join("\n");
    }
    formatSourceAttributes(rawAttributes) {
      return Object.entries(rawAttributes).map(([k, v]) => `  - \`${k}="${v}"\``).join("\n");
    }
    formatElementMetadata(element, info) {
      const computed = globalThis.getComputedStyle(element);
      const data = {
        framework: info.framework,
        component: info.componentName || element.tagName.toLowerCase(),
        file: info.fileName,
        line: info.lineNumber,
        column: info.columnNumber,
        dimensions: `${element.offsetWidth}x${element.offsetHeight}`,
        styles: {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          boxShadow: computed.boxShadow,
          margin: computed.margin,
          padding: computed.padding,
          display: computed.display,
          flexDirection: computed.flexDirection
        }
      };
      const tagName = element.tagName.toLowerCase();
      const classList = Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const selectorLabel = this.formatSelectorLabel(tagName, classList, info.staticMetadata?.classOrigins);
      const directionStr = data.styles.display === "flex" ? `(direction: ${data.styles.flexDirection})` : "";
      const config = this.controller.getConfig();
      const filters = config?.metadataFilter?.filters?.component;
      const isChecked = (key) => filters ? filters[key] !== false : true;
      const lines = [];
      const addLine = (key, content) => {
        if (isChecked(key)) {
          lines.push(typeof content === "function" ? content() : content);
        }
      };
      addLine("componentName", `* **Component**: \`${data.component}\``);
      addLine("elementSelector", `* **Element**: ${selectorLabel}`);
      addLine("filePath", () => {
        const lineColStr = data.line ? ` (Line: ${data.line}, Column: ${data.column})` : "";
        return `* **File Path**: \`${data.file || "Unknown"}\`${lineColStr}`;
      });
      addLine("framework", `* **Framework**: ${data.framework}`);
      addLine("dimensions", `* **Dimensions**: ${data.dimensions}`);
      addLine("keyStyles", `* **Key Styles**:
  - Color: \`${data.styles.color}\`
  - Background: \`${data.styles.backgroundColor}\`
  - Box Shadow: \`${data.styles.boxShadow}\`
  - Margin: \`${data.styles.margin}\` | Padding: \`${data.styles.padding}\`
  - Display: \`${data.styles.display}\` ${directionStr}`);
      if (info.visualContext) {
        addLine("parentStyles", () => {
          if (info.visualContext.parentEffects.length === 0)
            return "";
          const parentList = this.formatParentStyles(info.visualContext.parentEffects, info.staticMetadata?.classOrigins);
          return `* **Parent Styles**:
${parentList}`;
        });
        addLine("layoutConstraints", () => {
          if (Object.keys(info.visualContext.layoutConstraints).length === 0)
            return "";
          const layoutList = this.formatLayoutConstraints(info.visualContext.layoutConstraints);
          return `* **Layout Constraints**:
${layoutList}`;
        });
      }
      if (info.staticMetadata) {
        addLine("sourceComments", () => {
          if (!info.staticMetadata.comments || info.staticMetadata.comments.length === 0)
            return "";
          const commentList = this.formatSourceComments(info.staticMetadata.comments);
          return `* **Source Comments**:
${commentList}`;
        });
        addLine("sourceAttributes", () => {
          if (!info.staticMetadata.rawAttributes || Object.keys(info.staticMetadata.rawAttributes).length === 0)
            return "";
          const attrList = this.formatSourceAttributes(info.staticMetadata.rawAttributes);
          return `* **Source Attributes**:
${attrList}`;
        });
      }
      const filteredLines = lines.filter(Boolean);
      return filteredLines.join("\n");
    }
    copyMetadata() {
      if (!this.currentSourceInfo || !this.currentElement)
        return;
      const text = this.formatElementMetadata(this.currentElement, this.currentSourceInfo);
      this.controller.copyToClipboard(text);
    }
    getElementAttributes(elNode) {
      const attrs = [];
      if (elNode.id) {
        attrs.push(`id="${elNode.id}"`);
      }
      if (elNode.className && typeof elNode.className === "string") {
        const classes = Array.from(elNode.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
        if (classes.length > 0) {
          attrs.push(`class="${classes.join(" ")}"`);
        }
      }
      const href = elNode.getAttribute("href");
      if (href) {
        attrs.push(`href="${href}"`);
      }
      return attrs;
    }
    formatMinifiedHtmlNode(node, indent) {
      if (node.nodeType === 3) {
        const text = node.nodeValue?.trim();
        return text ? `${indent}...` : "";
      }
      if (node.nodeType === 1) {
        const elNode = node;
        const tagName = elNode.tagName.toLowerCase();
        const attrs = this.getElementAttributes(elNode);
        const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
        const children = Array.from(elNode.childNodes);
        if (children.length === 0) {
          return `${indent}<${tagName}${attrStr}></${tagName}>`;
        }
        const childStrings = children.map((c) => this.formatMinifiedHtmlNode(c, indent + "  ")).filter((s) => s !== "");
        if (childStrings.length === 0) {
          return `${indent}<${tagName}${attrStr}></${tagName}>`;
        }
        return `${indent}<${tagName}${attrStr}>
${childStrings.join("\n")}
${indent}</${tagName}>`;
      }
      return "";
    }
    getMinifiedHTML(el2) {
      const clone = el2.cloneNode(true);
      const hsEls = clone.querySelectorAll('#hoversource-host, .hoversource-container, [class^="hs-"]');
      hsEls.forEach((e) => e.remove());
      return this.formatMinifiedHtmlNode(clone, "");
    }
    getTargetHTMLToCopy(el2) {
      const parent = el2.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        const parentInfo = this.resolver.resolve(parent);
        const isParentCustomComponent = !!parentInfo?.componentName && parentInfo.framework !== "Unknown";
        if (!isParentCustomComponent && parent.children.length <= 5) {
          const leafTags = ["input", "button", "img", "svg", "span", "i", "a", "label"];
          if (leafTags.includes(el2.tagName.toLowerCase()) || el2.children.length === 0) {
            return parent;
          }
        }
      }
      return el2;
    }
    copyAllLayers() {
      if (this.layerStack.length === 0)
        return;
      const config = this.controller.getConfig();
      const filters = config?.metadataFilter?.filters?.layer;
      const isChecked = (key) => filters ? filters[key] !== false : true;
      let text = "";
      if (isChecked("layerSummary")) {
        text += `Found ${this.layerStack.length} layer(s), ordered from leaf (Layer 1) to root:

`;
      }
      this.layerStack.forEach((el2, index) => {
        const isLeaf = index === 0;
        if (isLeaf && !isChecked("layer1"))
          return;
        if (!isLeaf && !isChecked("layer2"))
          return;
        let info;
        if (el2 === this.currentElement && this.currentSourceInfo) {
          info = this.currentSourceInfo;
        } else {
          info = this.resolver.resolve(el2) || {
            componentName: el2.tagName.toLowerCase(),
            tagName: el2.tagName.toLowerCase(),
            framework: "Unknown",
            fileName: "",
            lineNumber: 0,
            columnNumber: 0,
            classList: Array.from(el2.classList),
            visualContext: null,
            staticMetadata: null
          };
          info.visualContext = inspectVisualContext(el2);
        }
        const layerNum = index + 1;
        const totalLayers = this.layerStack.length;
        text += `#### Layer ${layerNum}/${totalLayers}: \`${info.componentName || el2.tagName.toLowerCase()}\` (${el2.tagName.toLowerCase()})
`;
        text += this.formatElementMetadata(el2, info) + "\n\n";
      });
      if (isChecked("htmlStructure")) {
        const activeEl = this.layerStack[this.activeLayerIndex] || this.layerStack[0];
        if (activeEl) {
          const targetElToCopy = this.getTargetHTMLToCopy(activeEl);
          const label = targetElToCopy === activeEl ? `Layer ${this.activeLayerIndex + 1}` : `Layer ${this.activeLayerIndex + 1} with siblings`;
          text += `### Target Element HTML Structure (${label})
`;
          text += `\`\`\`html
${this.getMinifiedHTML(targetElToCopy)}
\`\`\`
`;
        }
      }
      this.controller.copyToClipboard(text.trim());
    }
  };

  // src/modes/DesignAdapter.ts
  var DesignAdapter = class {
    id = "design";
    controller;
    isFrozen = false;
    resolver = new SourceResolver();
    // Snapping and offset state
    targetElement = null;
    targetRect = null;
    anchorHElement = null;
    anchorVElement = null;
    isSnappedH = false;
    isSnappedV = false;
    snapBoundaryH = null;
    snapBoundaryV = null;
    snapX = 0;
    snapY = 0;
    snapMouseX = 0;
    snapMouseY = 0;
    dX = 0;
    dY = 0;
    lastMouseX = 0;
    lastMouseY = 0;
    // Spawning coordinates & dragging state
    crosshairX = 0;
    crosshairY = 0;
    isDragging = false;
    dragStartX = 0;
    dragStartY = 0;
    dragStartCrosshairX = 0;
    dragStartCrosshairY = 0;
    // DOM elements for Design Mode Overlay
    svgOverlay = null;
    badgeElementH = null;
    badgeElementV = null;
    dragBlocker = null;
    maxTraversalDepth = 32;
    activate(controller) {
      this.controller = controller;
      this.isFrozen = false;
      this.dX = 0;
      this.dY = 0;
      this.isSnappedH = false;
      this.isSnappedV = false;
      this.targetElement = null;
      this.anchorHElement = null;
      this.anchorVElement = null;
      this.maxTraversalDepth = controller.getConfig()?.maxTraversalDepth ?? 32;
      this.crosshairX = globalThis.innerWidth / 2;
      this.crosshairY = globalThis.innerHeight / 2;
      this.lastMouseX = this.crosshairX;
      this.lastMouseY = this.crosshairY;
      const container = this.controller.container;
      if (container) {
        this.svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgOverlay.setAttribute("id", "hoversource-design-svg");
        this.svgOverlay.style.position = "absolute";
        this.svgOverlay.style.top = "0";
        this.svgOverlay.style.left = "0";
        this.svgOverlay.style.width = "100%";
        this.svgOverlay.style.height = "100%";
        this.svgOverlay.style.pointerEvents = "none";
        this.svgOverlay.style.overflow = "visible";
        this.svgOverlay.style.zIndex = "99999";
        container.appendChild(this.svgOverlay);
        this.badgeElementH = document.createElement("div");
        this.badgeElementH.style.position = "absolute";
        this.badgeElementH.style.background = "#10b981";
        this.badgeElementH.style.color = "#ffffff";
        this.badgeElementH.style.padding = "2px 6px";
        this.badgeElementH.style.borderRadius = "4px";
        this.badgeElementH.style.fontSize = "10px";
        this.badgeElementH.style.fontWeight = "bold";
        this.badgeElementH.style.pointerEvents = "none";
        this.badgeElementH.style.display = "none";
        this.badgeElementH.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        this.badgeElementH.style.zIndex = "100000";
        container.appendChild(this.badgeElementH);
        this.badgeElementV = document.createElement("div");
        this.badgeElementV.style.position = "absolute";
        this.badgeElementV.style.background = "#10b981";
        this.badgeElementV.style.color = "#ffffff";
        this.badgeElementV.style.padding = "2px 6px";
        this.badgeElementV.style.borderRadius = "4px";
        this.badgeElementV.style.fontSize = "10px";
        this.badgeElementV.style.fontWeight = "bold";
        this.badgeElementV.style.pointerEvents = "none";
        this.badgeElementV.style.display = "none";
        this.badgeElementV.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        this.badgeElementV.style.zIndex = "100000";
        container.appendChild(this.badgeElementV);
      }
      this.updateTargetAtPosition(this.crosshairX, this.crosshairY);
      this.checkSnapping(this.crosshairX, this.crosshairY);
      this.updateVisuals();
      globalThis.addEventListener("keydown", this.handleKeyDown, { capture: true });
      console.log("[HoverSource] Activated Design Mode - Spawned at Center");
    }
    deactivate() {
      this.controller.clear();
      if (this.svgOverlay)
        this.svgOverlay.remove();
      if (this.badgeElementH)
        this.badgeElementH.remove();
      if (this.badgeElementV)
        this.badgeElementV.remove();
      if (this.dragBlocker) {
        this.dragBlocker.remove();
        this.dragBlocker = null;
      }
      globalThis.removeEventListener("keydown", this.handleKeyDown, { capture: true });
      globalThis.removeEventListener("pointermove", this.handleDragMove, { capture: true });
      globalThis.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
      if (this.isFrozen) {
        this.isFrozen = false;
        this.controller.setFreezeMode(false);
      }
    }
    onPointerOver(event, target) {
    }
    onPointerMove(event) {
      if (!this.isDragging && this.targetElement) {
        this.controller.drawTooltip("", event);
      }
    }
    updateTargetAtPosition(x, y) {
      const container = this.controller.container;
      const shadowHost = this.controller.shadowHost;
      const elements = document.elementsFromPoint(x, y);
      const target = elements.find((el2) => {
        if (el2 === document.documentElement || el2 === document.body)
          return false;
        if (shadowHost && (el2 === shadowHost || shadowHost.contains(el2)))
          return false;
        if (container && (el2 === container || container.contains(el2)))
          return false;
        return true;
      }) ?? this.anchorHElement ?? this.anchorVElement ?? void 0;
      if (target) {
        this.targetElement = target;
        this.targetRect = target.getBoundingClientRect();
      } else {
        this.targetElement = null;
        this.targetRect = null;
      }
    }
    handleDragStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartCrosshairX = this.crosshairX;
      this.dragStartCrosshairY = this.crosshairY;
      const container = this.controller.container;
      if (container && !this.dragBlocker) {
        this.dragBlocker = document.createElement("div");
        this.dragBlocker.style.position = "fixed";
        this.dragBlocker.style.top = "0";
        this.dragBlocker.style.left = "0";
        this.dragBlocker.style.width = "100vw";
        this.dragBlocker.style.height = "100vh";
        this.dragBlocker.style.pointerEvents = "auto";
        this.dragBlocker.style.cursor = "grabbing";
        this.dragBlocker.style.zIndex = "99998";
        container.appendChild(this.dragBlocker);
      }
      globalThis.addEventListener("pointermove", this.handleDragMove, { capture: true });
      globalThis.addEventListener("pointerup", this.handleDragEnd, { capture: true });
    };
    handleDragMove = (e) => {
      if (!this.isDragging)
        return;
      e.preventDefault();
      e.stopPropagation();
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      const newX = this.dragStartCrosshairX + deltaX;
      const newY = this.dragStartCrosshairY + deltaY;
      this.lastMouseX = newX;
      this.lastMouseY = newY;
      this.updateTargetAtPosition(newX, newY);
      const HSconfig = this.controller.getConfig();
      const deSnapThreshold = HSconfig?.desnappingThreshold ?? 15;
      if (this.isSnappedH || this.isSnappedV) {
        if (shouldReleaseSnap(newX, newY, this.snapMouseX, this.snapMouseY, deSnapThreshold)) {
          this.isSnappedH = false;
          this.isSnappedV = false;
          this.checkSnapping(newX, newY);
        }
      } else {
        this.checkSnapping(newX, newY);
      }
      this.crosshairX = this.isSnappedH ? this.snapX : newX;
      this.crosshairY = this.isSnappedV ? this.snapY : newY;
      this.updateVisuals();
      this.renderTooltip(e);
    };
    handleDragEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = false;
      if (this.dragBlocker) {
        this.dragBlocker.remove();
        this.dragBlocker = null;
      }
      globalThis.removeEventListener("pointermove", this.handleDragMove, { capture: true });
      globalThis.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
    };
    getSnapCandidates(mouseX, mouseY) {
      const container = this.controller.container;
      const shadowHost = this.controller.shadowHost;
      const allEls = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, button, input, textarea, label, span, div, section, main, article, li, img, svg"));
      const candidates = [];
      for (const el2 of allEls) {
        if (el2 === document.documentElement || el2 === document.body)
          continue;
        if (shadowHost && (el2 === shadowHost || shadowHost.contains(el2)))
          continue;
        if (container && (el2 === container || container.contains(el2)))
          continue;
        const rect = el2.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
          continue;
        const distToCenterH = Math.min(Math.abs(rect.left - mouseX), Math.abs(rect.right - mouseX), Math.abs(rect.left + rect.width / 2 - mouseX));
        const distToCenterV = Math.min(Math.abs(rect.top - mouseY), Math.abs(rect.bottom - mouseY), Math.abs(rect.top + rect.height / 2 - mouseY));
        if (distToCenterH > 450 && distToCenterV > 450)
          continue;
        candidates.push({ element: el2, rect });
      }
      return candidates;
    }
    selectBestH(candidates, mouseX, mouseY) {
      let bestH = null;
      let minScoreH = Infinity;
      for (const cand of candidates) {
        const rect = cand.rect;
        const opts = [
          { boundary: "Left-Edge", value: rect.left },
          { boundary: "Right-Edge", value: rect.right },
          { boundary: "Center-Axis", value: rect.left + rect.width / 2 }
        ];
        for (const opt of opts) {
          const minDistH = Math.abs(mouseX - opt.value);
          let visualDistV = 0;
          if (mouseY < rect.top) {
            visualDistV = rect.top - mouseY;
          } else if (mouseY > rect.bottom) {
            visualDistV = mouseY - rect.bottom;
          }
          const scoreH = minDistH + visualDistV * 0.4;
          if (scoreH < minScoreH) {
            minScoreH = scoreH;
            bestH = {
              element: cand.element,
              rect,
              boundary: opt.boundary,
              value: opt.value,
              distance: minDistH
            };
          }
        }
      }
      return bestH;
    }
    selectBestV(candidates, mouseX, mouseY) {
      let bestV = null;
      let minScoreV = Infinity;
      for (const cand of candidates) {
        const rect = cand.rect;
        const opts = [
          { boundary: "Top-Edge", value: rect.top },
          { boundary: "Bottom-Edge", value: rect.bottom },
          { boundary: "Center-Axis", value: rect.top + rect.height / 2 }
        ];
        for (const opt of opts) {
          const minDistV = Math.abs(mouseY - opt.value);
          let visualDistH = 0;
          if (mouseX < rect.left) {
            visualDistH = rect.left - mouseX;
          } else if (mouseX > rect.right) {
            visualDistH = mouseX - rect.right;
          }
          const scoreV = minDistV + visualDistH * 0.4;
          if (scoreV < minScoreV) {
            minScoreV = scoreV;
            bestV = {
              element: cand.element,
              rect,
              boundary: opt.boundary,
              value: opt.value,
              distance: minDistV
            };
          }
        }
      }
      return bestV;
    }
    assignHorizontalSnap(bestH, mouseX) {
      const HSconfig = this.controller.getConfig();
      const snapThreshold = HSconfig?.snappingThreshold ?? 15;
      if (bestH) {
        this.anchorHElement = bestH.element;
        this.snapBoundaryH = bestH.boundary;
        if (bestH.distance < snapThreshold) {
          if (!this.isSnappedH) {
            this.isSnappedH = true;
            this.snapX = bestH.value;
            this.snapMouseX = mouseX;
            this.dX = 0;
          }
        } else {
          this.isSnappedH = false;
          this.snapX = mouseX;
        }
      } else {
        this.anchorHElement = null;
        this.snapBoundaryH = null;
        this.isSnappedH = false;
      }
    }
    assignVerticalSnap(bestV, mouseY) {
      const HSconfig = this.controller.getConfig();
      const snapThreshold = HSconfig?.snappingThreshold ?? 15;
      if (bestV) {
        this.anchorVElement = bestV.element;
        this.snapBoundaryV = bestV.boundary;
        if (bestV.distance < snapThreshold) {
          if (!this.isSnappedV) {
            this.isSnappedV = true;
            this.snapY = bestV.value;
            this.snapMouseY = mouseY;
            this.dY = 0;
          }
        } else {
          this.isSnappedV = false;
          this.snapY = mouseY;
        }
      } else {
        this.anchorVElement = null;
        this.snapBoundaryV = null;
        this.isSnappedV = false;
      }
    }
    checkSnapping(mouseX, mouseY) {
      const candidates = this.getSnapCandidates(mouseX, mouseY);
      if (candidates.length === 0) {
        this.anchorHElement = null;
        this.anchorVElement = null;
        this.isSnappedH = false;
        this.isSnappedV = false;
        this.snapBoundaryH = null;
        this.snapBoundaryV = null;
        return;
      }
      const bestH = this.selectBestH(candidates, mouseX, mouseY);
      const bestV = this.selectBestV(candidates, mouseX, mouseY);
      this.assignHorizontalSnap(bestH, mouseX);
      this.assignVerticalSnap(bestV, mouseY);
    }
    drawHorizontalGuide(svgNS, dotViewportX, dotAbsX, dotAbsY) {
      const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
      if (this.anchorHElement && rectH) {
        const rectAbsLeft = rectH.left;
        const rectAbsRight = rectH.right;
        const rectAbsCenterX = rectAbsLeft + rectH.width / 2;
        let anchorX = rectAbsLeft;
        if (this.snapBoundaryH === "Right-Edge") {
          anchorX = rectAbsRight;
        } else if (this.snapBoundaryH === "Center-Axis") {
          anchorX = rectAbsCenterX;
        }
        const lineH = document.createElementNS(svgNS, "line");
        lineH.setAttribute("x1", anchorX.toString());
        lineH.setAttribute("y1", dotAbsY.toString());
        lineH.setAttribute("x2", dotAbsX.toString());
        lineH.setAttribute("y2", dotAbsY.toString());
        lineH.setAttribute("stroke", "#10b981");
        lineH.setAttribute("stroke-dasharray", "4");
        lineH.setAttribute("stroke-width", "1.5");
        this.svgOverlay.appendChild(lineH);
        const offsetH = Math.round(dotViewportX - anchorX);
        const displayOffsetH = offsetH >= 0 ? `+${offsetH}` : `${offsetH}`;
        if (this.badgeElementH) {
          this.badgeElementH.textContent = `${displayOffsetH}px`;
          this.badgeElementH.style.display = "block";
          this.badgeElementH.style.left = `${(anchorX + dotAbsX) / 2 - 20}px`;
          this.badgeElementH.style.top = `${dotAbsY - 20}px`;
        }
      }
    }
    drawVerticalGuide(svgNS, dotViewportY, dotAbsX, dotAbsY) {
      const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
      if (this.anchorVElement && rectV) {
        const rectAbsTop = rectV.top;
        const rectAbsBottom = rectV.bottom;
        const rectAbsCenterY = rectAbsTop + rectV.height / 2;
        let anchorY = rectAbsTop;
        if (this.snapBoundaryV === "Bottom-Edge") {
          anchorY = rectAbsBottom;
        } else if (this.snapBoundaryV === "Center-Axis") {
          anchorY = rectAbsCenterY;
        }
        const lineV = document.createElementNS(svgNS, "line");
        lineV.setAttribute("x1", dotAbsX.toString());
        lineV.setAttribute("y1", anchorY.toString());
        lineV.setAttribute("x2", dotAbsX.toString());
        lineV.setAttribute("y2", dotAbsY.toString());
        lineV.setAttribute("stroke", "#10b981");
        lineV.setAttribute("stroke-dasharray", "4");
        lineV.setAttribute("stroke-width", "1.5");
        this.svgOverlay.appendChild(lineV);
        const offsetV = Math.round(dotViewportY - anchorY);
        const displayOffsetV = offsetV >= 0 ? `+${offsetV}` : `${offsetV}`;
        if (this.badgeElementV) {
          this.badgeElementV.textContent = `${displayOffsetV}px`;
          this.badgeElementV.style.display = "block";
          this.badgeElementV.style.left = `${dotAbsX + 10}px`;
          this.badgeElementV.style.top = `${(anchorY + dotAbsY) / 2 - 8}px`;
        }
      }
    }
    drawCrosshairAndDragHandle(svgNS, dotAbsX, dotAbsY) {
      const crosshairCircle = document.createElementNS(svgNS, "circle");
      crosshairCircle.setAttribute("cx", dotAbsX.toString());
      crosshairCircle.setAttribute("cy", dotAbsY.toString());
      crosshairCircle.setAttribute("r", "5");
      crosshairCircle.setAttribute("fill", "none");
      crosshairCircle.setAttribute("stroke", "#10b981");
      crosshairCircle.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairCircle);
      const crosshairH = document.createElementNS(svgNS, "line");
      crosshairH.setAttribute("x1", (dotAbsX - 8).toString());
      crosshairH.setAttribute("y1", dotAbsY.toString());
      crosshairH.setAttribute("x2", (dotAbsX + 8).toString());
      crosshairH.setAttribute("y2", dotAbsY.toString());
      crosshairH.setAttribute("stroke", "#10b981");
      crosshairH.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairH);
      const crosshairV = document.createElementNS(svgNS, "line");
      crosshairV.setAttribute("x1", dotAbsX.toString());
      crosshairV.setAttribute("y1", (dotAbsY - 8).toString());
      crosshairV.setAttribute("x2", dotAbsX.toString());
      crosshairV.setAttribute("y2", (dotAbsY + 8).toString());
      crosshairV.setAttribute("stroke", "#10b981");
      crosshairV.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairV);
      const dragHandle = document.createElementNS(svgNS, "circle");
      dragHandle.setAttribute("cx", dotAbsX.toString());
      dragHandle.setAttribute("cy", dotAbsY.toString());
      dragHandle.setAttribute("r", "15");
      dragHandle.setAttribute("fill", "transparent");
      dragHandle.style.cursor = "move";
      dragHandle.style.pointerEvents = "auto";
      dragHandle.addEventListener("pointerdown", this.handleDragStart);
      this.svgOverlay.appendChild(dragHandle);
    }
    updateVisuals() {
      if (!this.svgOverlay || !this.controller.isUIVisible())
        return;
      this.svgOverlay.replaceChildren();
      if (this.badgeElementH)
        this.badgeElementH.style.display = "none";
      if (this.badgeElementV)
        this.badgeElementV.style.display = "none";
      if (this.targetElement) {
        this.controller.drawHighlight(this.targetElement, this.isFrozen);
      }
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const dotAbsX = dotViewportX;
      const dotAbsY = dotViewportY;
      const svgNS = "http://www.w3.org/2000/svg";
      const drawAnchorOutline = (el2, color) => {
        const rect = el2.getBoundingClientRect();
        const box = document.createElementNS(svgNS, "rect");
        box.setAttribute("x", rect.left.toString());
        box.setAttribute("y", rect.top.toString());
        box.setAttribute("width", rect.width.toString());
        box.setAttribute("height", rect.height.toString());
        box.setAttribute("fill", color);
        box.setAttribute("stroke", "#10b981");
        box.setAttribute("stroke-width", "1");
        box.setAttribute("stroke-dasharray", "2");
        this.svgOverlay.appendChild(box);
      };
      if (this.anchorHElement) {
        drawAnchorOutline(this.anchorHElement, "rgba(16, 185, 129, 0.1)");
      }
      if (this.anchorVElement && this.anchorVElement !== this.anchorHElement) {
        drawAnchorOutline(this.anchorVElement, "rgba(59, 130, 246, 0.1)");
      }
      this.drawHorizontalGuide(svgNS, dotViewportX, dotAbsX, dotAbsY);
      this.drawVerticalGuide(svgNS, dotViewportY, dotAbsX, dotAbsY);
      this.drawCrosshairAndDragHandle(svgNS, dotAbsX, dotAbsY);
    }
    getHorizontalOffset(dotViewportX) {
      const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
      let valH = 0;
      if (rectH) {
        valH = rectH.left;
        if (this.snapBoundaryH === "Right-Edge")
          valH = rectH.right;
        else if (this.snapBoundaryH === "Center-Axis")
          valH = rectH.left + rectH.width / 2;
      }
      return Math.round(dotViewportX - valH);
    }
    getVerticalOffset(dotViewportY) {
      const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
      let valV = 0;
      if (rectV) {
        valV = rectV.top;
        if (this.snapBoundaryV === "Bottom-Edge")
          valV = rectV.bottom;
        else if (this.snapBoundaryV === "Center-Axis")
          valV = rectV.top + rectV.height / 2;
      }
      return Math.round(dotViewportY - valV);
    }
    formatAnchorStatus(element, selector, boundary, offset) {
      if (!element)
        return `<span style="color: #6b7280;">No Anchor</span>`;
      const sign = offset >= 0 ? "+" : "";
      return `<span style="color: #10b981; font-weight:bold;">${escapeHtml(selector)} @ ${escapeHtml(boundary || "None")} (${sign}${offset}px)</span>`;
    }
    buildTooltipHtml(info, fileBase, hStatus, vStatus, hintHtml, vueHint) {
      const classList = Array.from(this.targetElement.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const classStr = classList.length > 0 ? "." + classList.join(".") : "";
      const idStr = this.targetElement.id ? "#" + this.targetElement.id : "";
      const tagLower = this.targetElement.tagName.toLowerCase();
      return `
      <div class="hoversource-title" style="color: #10b981;">
        <span>Design Mode ${this.isFrozen ? "[FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="background: #064e3b; color: #34d399;">Active</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor Element: </span>
        <span class="hoversource-value">${escapeHtml(`${tagLower}${idStr}${classStr}`)}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor File: </span>
        <span class="hoversource-value" style="color: #60a5fa;">${escapeHtml(fileBase)}${info.lineNumber ? `:${info.lineNumber}` : ""}</span>
      </div>
      <div class="hoversource-section" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
        <span class="hoversource-label">H-Anchor: </span>
        ${hStatus}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">V-Anchor: </span>
        ${vStatus}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Nudge Offsets (dX, dY): </span>
        <span class="hoversource-value">${this.dX}px, ${this.dY}px</span>
      </div>
      ${vueHint}
      <div class="hoversource-shortcut-hint" style="margin-top: 8px;">
        ${hintHtml}
      </div>
    `;
    }
    renderTooltip(e) {
      if (!this.targetElement)
        return;
      const info = this.resolver.resolve(this.targetElement) || {
        componentName: this.targetElement.tagName.toLowerCase(),
        tagName: this.targetElement.tagName.toLowerCase(),
        framework: "Unknown",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(this.targetElement.classList)
      };
      const config = this.controller.getConfig();
      const shortcuts = config?.shortcuts;
      const isMac = isMacPlatform();
      const copyLabel = formatShortcutLabel(shortcuts?.copyMetadata ?? DEFAULT_SHORTCUTS.copyMetadata, isMac);
      const freezeLabel = formatShortcutLabel(shortcuts?.toggleFreeze ?? DEFAULT_SHORTCUTS.toggleFreeze, isMac);
      const modeLabel = formatShortcutLabel(shortcuts?.toggleMode ?? DEFAULT_SHORTCUTS.toggleMode, isMac);
      const uiLabel = formatShortcutLabel(shortcuts?.toggleUI ?? DEFAULT_SHORTCUTS.toggleUI, isMac);
      const filterLabel = formatShortcutLabel(shortcuts?.toggleFilterPanel ?? DEFAULT_SHORTCUTS.toggleFilterPanel, isMac);
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const offsetH = this.getHorizontalOffset(dotViewportX);
      const offsetV = this.getVerticalOffset(dotViewportY);
      const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
      const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
      const hStatus = this.formatAnchorStatus(this.anchorHElement, selectorH, this.snapBoundaryH, offsetH);
      const vStatus = this.formatAnchorStatus(this.anchorVElement, selectorV, this.snapBoundaryV, offsetV);
      const fileBase = info.fileName ? info.fileName.split("/").pop()?.split("\\").pop() || "unknown" : "unknown";
      const hintText = `Drag the Crosshair to position | Press ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze & Nudge"} | ${copyLabel} to Copy Design Metadata | ${filterLabel} for Filters | ${uiLabel} to Hide/Show | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${escapeHtml(part.trim())}</span>`).join(" | ");
      let vueHint = "";
      if (info.framework === "Vue" && !info.lineNumber) {
        vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
      }
      const html = this.buildTooltipHtml(info, fileBase, hStatus, vStatus, hintHtml, vueHint);
      this.controller.drawTooltip(html, e);
    }
    onShortcut(command) {
      if (command === "toggleFreeze") {
        this.isFrozen = !this.isFrozen;
        this.controller.setFreezeMode(this.isFrozen);
        console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
        this.updateVisuals();
        this.renderTooltip({ clientX: this.lastMouseX, clientY: this.lastMouseY });
      } else if (command === "copyMetadata") {
        this.copyMetadata();
      }
    }
    handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable")) {
          return;
        }
      }
      if (this.isFrozen && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const nudge = calculateNudge(e.key, e.shiftKey, this.dX, this.dY);
        this.dX = nudge.dX;
        this.dY = nudge.dY;
        this.updateVisuals();
        this.renderTooltip({ clientX: this.lastMouseX, clientY: this.lastMouseY });
      }
    };
    getAnchorDisplayInfo(anchorForContext) {
      if (!anchorForContext) {
        return { display: "", note: null };
      }
      try {
        const anchorComp = globalThis.getComputedStyle(anchorForContext);
        const d = anchorComp.display || "block";
        if (d === "flex" || d === "inline-flex") {
          return {
            display: `${d} (flex-direction: ${anchorComp.flexDirection})`,
            note: `Anchor element is a flex container. If inserting a new child into it, a flex child approach (e.g. margin-left: auto) may be more appropriate than position: absolute.`
          };
        } else if (d === "grid" || d === "inline-grid") {
          return {
            display: d,
            note: `Anchor element is a grid container. If inserting a new child into it, a grid child approach may be more appropriate than position: absolute.`
          };
        } else {
          return { display: d, note: null };
        }
      } catch {
        return { display: "", note: null };
      }
    }
    getRelatedFilesList(anchorFile, anchorLine, ancestors) {
      const seenFiles = /* @__PURE__ */ new Set([anchorFile]);
      const relatedFiles = anchorFile ? [`\`${anchorFile}\` (Line: ${anchorLine}) \u2014 anchor component`] : [];
      for (const anc of ancestors) {
        if (anc.fileName && !seenFiles.has(anc.fileName)) {
          seenFiles.add(anc.fileName);
          const label = anc.componentName ? ` \u2014 \`${anc.componentName}\`` : "";
          relatedFiles.push(`\`${anc.fileName}\` (Line: ${anc.lineNumber || 1})${label}`);
        }
      }
      return relatedFiles;
    }
    getPlacementAndRules(commonParent) {
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const offsetH = this.getHorizontalOffset(dotViewportX);
      const offsetV = this.getVerticalOffset(dotViewportY);
      const cssRules = getSuggestedCSS({
        boundaryH: this.snapBoundaryH,
        boundaryV: this.snapBoundaryV,
        offsetH,
        offsetV,
        parentContainer: commonParent,
        activeX: dotViewportX,
        activeY: dotViewportY,
        anchorH: this.anchorHElement,
        anchorV: this.anchorVElement
      });
      return { offsetH, offsetV, cssRules };
    }
    getTargetSelector() {
      if (!this.targetElement)
        return "";
      const tagName = this.targetElement.tagName.toLowerCase();
      const classList = Array.from(this.targetElement.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const idStr = this.targetElement.id ? `#${this.targetElement.id}` : "";
      return `${tagName}${idStr}${classStr}`;
    }
    buildMetadataText(p) {
      const config = this.controller.getConfig();
      const filters = config?.metadataFilter?.filters?.design;
      const isChecked = (key) => filters ? filters[key] !== false : true;
      let lines = [];
      if (isChecked("compInfo")) {
        const lineColStr = p.line ? ` (Line: ${p.line}, Column: ${p.column})` : "";
        lines.push(
          `* **Component**: \`${p.component}\``,
          `* **Element**: \`${p.selector}\``,
          `* **File Path**: \`${p.filePath}\`${lineColStr}`,
          `* **Framework**: ${p.framework}`
        );
      }
      if (isChecked("horizontalAnchor")) {
        lines.push(`* **Horizontal Anchor**:
  - Selector: \`${p.selectorH}\`
  - Boundary: \`${p.boundaryH}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signH}${p.offsetH}px\` (${p.isSnappedHText})`);
      }
      if (isChecked("verticalAnchor")) {
        lines.push(`* **Vertical Anchor**:
  - Selector: \`${p.selectorV}\`
  - Boundary: \`${p.boundaryV}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signV}${p.offsetV}px\` (${p.isSnappedVText})`);
      }
      if (isChecked("layoutContext")) {
        lines.push(`#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${p.posAncLine}
* **Anchor Element**: \`${p.anchorForContextSelector}\` (display: ${p.anchorElementDisplay})
${p.anchorNoteStr}\\
* **Direct Parent of Anchor**: ${p.directParentLine}
${p.warningStr}\\`);
      }
      if (isChecked("suggestedCss")) {
        lines.push(`* **USE THIS CSS** (do not use the distance values above as CSS \u2014 use this block):
\`\`\`css
${p.cssRules}
\`\`\``);
      }
      if (isChecked("sourceFiles")) {
        lines.push(`* **Source Files to Examine**:
${p.filesSection}`);
      }
      if (isChecked("aiInstructions")) {
        lines.push(`#### For the AI Agent
The CSS above assumes the new element will be a direct child of the Positioned Ancestor.
You must determine the actual DOM insertion point by examining the source files above.
The following is NOT resolved automatically and requires your judgment:
- **DOM insertion point**: where in the JSX/template tree the new element belongs
  (sibling of anchor, child of a wrapper, inside a portal, etc.)
- **Whether \`position: absolute\` is appropriate**: if the anchor or its parent is a flex/grid`);
      }
      return lines.join("\n");
    }
    getLayoutContextInfo(info, anchorForContext, ancestors) {
      const positionedAncestor = ancestors.find((a) => a.position !== "static") ?? null;
      const directParent = ancestors[0] ?? null;
      const anchorFile = info.fileName || "";
      const relatedFiles = this.getRelatedFilesList(anchorFile, info.lineNumber || 1, ancestors);
      let posAncLine = "none found within 8 levels \u2014 CSS rules may need `position: relative` added to a parent";
      if (positionedAncestor) {
        const sourceInfo = positionedAncestor.fileName ? `, source: \`${positionedAncestor.fileName}\`:${positionedAncestor.lineNumber || 1}` : ", source unresolved (no fiber)";
        posAncLine = `\`${positionedAncestor.selector}\` (position: ${positionedAncestor.position})${sourceInfo}`;
      }
      let directParentLine = "unresolved";
      if (directParent) {
        let layoutPropsStr = "";
        if (directParent.layoutProps) {
          layoutPropsStr = "\n  - " + Object.entries(directParent.layoutProps).filter(([, v]) => v && v !== "normal" && v !== "0px").map(([k, v]) => `${k}: ${v}`).join(" | ");
        }
        directParentLine = `\`${directParent.selector}\` (display: ${directParent.display})${layoutPropsStr}`;
      }
      const parentDisplay = directParent?.display ?? "";
      let layoutWarning = null;
      const isParentFlexOrGrid = parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid";
      if (isParentFlexOrGrid) {
        const childType = parentDisplay.startsWith("grid") ? "grid" : "flex";
        layoutWarning = `Direct parent is a ${parentDisplay} container. Inserting as a ${childType} child or with position: absolute are both options \u2014 verify which fits the component layout.`;
      }
      const filesSection = relatedFiles.length > 0 ? relatedFiles.map((f) => `  - ${f}`).join("\n") : "  - No source files resolved (fiber not available \u2014 non-React or production build)";
      return { posAncLine, directParentLine, layoutWarning, filesSection };
    }
    copyMetadata() {
      if (!this.targetElement)
        return;
      const info = this.resolver.resolve(this.targetElement) || {
        componentName: this.targetElement.tagName.toLowerCase(),
        tagName: this.targetElement.tagName.toLowerCase(),
        framework: "Unknown",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(this.targetElement.classList)
      };
      const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
      const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
      const commonParent = findCommonAncestor(this.anchorHElement, this.anchorVElement);
      const parentSelector = getSelector(commonParent);
      const { offsetH, offsetV, cssRules } = this.getPlacementAndRules(commonParent);
      const isHAndVSame = this.anchorHElement && this.anchorHElement === this.anchorVElement;
      const selector = this.getTargetSelector();
      const anchorForContext = this.anchorHElement || this.anchorVElement || this.targetElement;
      const ancestors = this.resolver.resolveAncestors(anchorForContext, this.maxTraversalDepth);
      const anchorDisplayInfo = this.getAnchorDisplayInfo(anchorForContext);
      const anchorElementDisplay = anchorDisplayInfo.display;
      const anchorDisplayNote = anchorDisplayInfo.note;
      const contextInfo = this.getLayoutContextInfo(info, anchorForContext, ancestors);
      const signH = offsetH >= 0 ? "+" : "";
      const isSnappedHText = this.isSnappedH ? "Snapped" : "Free";
      const signV = offsetV >= 0 ? "+" : "";
      const isSnappedVText = this.isSnappedV ? "Snapped" : "Free";
      const targetParentSelector = isHAndVSame ? selectorH : parentSelector;
      const targetParentType = isHAndVSame ? "same as anchor" : "common ancestor of H and V anchors";
      const anchorNoteStr = anchorDisplayNote ? `  - ${anchorDisplayNote}
` : "";
      const warningStr = contextInfo.layoutWarning ? `* ${contextInfo.layoutWarning}
` : "";
      const text = this.buildMetadataText({
        component: info.componentName || this.targetElement.tagName.toLowerCase(),
        selector,
        filePath: info.fileName || "unknown",
        line: info.lineNumber,
        column: info.columnNumber,
        framework: info.framework,
        selectorH,
        boundaryH: this.snapBoundaryH || "None",
        signH,
        offsetH,
        isSnappedHText,
        selectorV,
        boundaryV: this.snapBoundaryV || "None",
        signV,
        offsetV,
        isSnappedVText,
        posAncLine: contextInfo.posAncLine,
        anchorForContextSelector: getSelector(anchorForContext),
        anchorElementDisplay: anchorElementDisplay || "block",
        anchorNoteStr,
        directParentLine: contextInfo.directParentLine,
        warningStr,
        cssRules,
        filesSection: contextInfo.filesSection,
        targetParentSelector,
        targetParentType
      });
      this.controller.copyToClipboard(text);
    }
    onConfigUpdate(newConfig) {
      this.maxTraversalDepth = newConfig?.maxTraversalDepth ?? 32;
      if (this.targetElement && this.controller.isUIVisible()) {
        this.renderTooltip({ clientX: 0, clientY: 0 });
      }
    }
    onUIVisibilityChanged(visible) {
      if (this.svgOverlay) {
        this.svgOverlay.style.display = visible ? "block" : "none";
      }
      if (this.badgeElementH) {
        this.badgeElementH.style.display = visible && this.isSnappedH ? "block" : "none";
      }
      if (this.badgeElementV) {
        this.badgeElementV.style.display = visible && this.isSnappedV ? "block" : "none";
      }
    }
  };
  function shouldReleaseSnap(mouseX, mouseY, snapMouseX, snapMouseY, deadzone) {
    const distX = Math.abs(mouseX - snapMouseX);
    const distY = Math.abs(mouseY - snapMouseY);
    return distX > deadzone || distY > deadzone;
  }
  function calculateNudge(key, shiftKey, currentDx, currentDy) {
    const step = shiftKey ? 8 : 1;
    let dX = currentDx;
    let dY = currentDy;
    if (key === "ArrowLeft") {
      dX -= step;
    } else if (key === "ArrowRight") {
      dX += step;
    } else if (key === "ArrowUp") {
      dY -= step;
    } else if (key === "ArrowDown") {
      dY += step;
    }
    return { dX, dY };
  }
  function findCommonAncestor(el1, el2) {
    if (!el1 || !el2)
      return typeof document === "undefined" ? el1 || el2 || {} : document.body;
    const path = [];
    let curr = el1;
    while (curr) {
      path.push(curr);
      curr = curr.parentElement;
    }
    curr = el2;
    while (curr) {
      if (path.includes(curr))
        return curr;
      curr = curr.parentElement;
    }
    return document.body;
  }
  function getSelector(el2) {
    if (!el2)
      return "";
    const tag = el2.tagName.toLowerCase();
    const id = el2.id ? `#${el2.id}` : "";
    const classes = Array.from(el2.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
    const classStr = classes ? `.${classes}` : "";
    return `${tag}${id}${classStr}`;
  }
  function getHorizontalPositionRules(boundaryH, offsetH, rules) {
    let transformX = "";
    if (boundaryH === "Left-Edge") {
      if (offsetH >= 0) {
        rules.push(`  left: ${offsetH}px;`);
      } else {
        rules.push(`  right: calc(100% + ${Math.abs(offsetH)}px);`);
      }
    } else if (boundaryH === "Right-Edge") {
      if (offsetH >= 0) {
        rules.push(`  left: calc(100% + ${offsetH}px);`);
      } else {
        rules.push(`  right: ${Math.abs(offsetH)}px;`);
      }
    } else if (boundaryH === "Center-Axis") {
      if (offsetH === 0) {
        rules.push(`  left: 50%;`);
      } else {
        rules.push(`  left: calc(50% + ${offsetH}px);`);
      }
      transformX = "translateX(-50%)";
    }
    return transformX;
  }
  function getVerticalPositionRules(boundaryV, offsetV, rules) {
    let transformY = "";
    if (boundaryV === "Top-Edge") {
      if (offsetV >= 0) {
        rules.push(`  top: ${offsetV}px;`);
      } else {
        rules.push(`  bottom: calc(100% + ${Math.abs(offsetV)}px);`);
      }
    } else if (boundaryV === "Bottom-Edge") {
      if (offsetV >= 0) {
        rules.push(`  top: calc(100% + ${offsetV}px);`);
      } else {
        rules.push(`  bottom: ${Math.abs(offsetV)}px;`);
      }
    } else if (boundaryV === "Center-Axis") {
      if (offsetV === 0) {
        rules.push(`  top: 50%;`);
      } else {
        rules.push(`  top: calc(50% + ${offsetV}px);`);
      }
      transformY = "translateY(-50%)";
    }
    return transformY;
  }
  function getSuggestedCSS(params) {
    const {
      boundaryH,
      boundaryV,
      offsetH,
      offsetV,
      parentContainer,
      activeX,
      activeY,
      anchorH,
      anchorV
    } = params;
    const rules = ["position: absolute;"];
    if (anchorH && anchorH === anchorV) {
      const transformX = getHorizontalPositionRules(boundaryH, offsetH, rules);
      const transformY = getVerticalPositionRules(boundaryV, offsetV, rules);
      if (transformX && transformY) {
        rules.push("  transform: translate(-50%, -50%);");
      } else if (transformX) {
        rules.push(`  transform: ${transformX};`);
      } else if (transformY) {
        rules.push(`  transform: ${transformY};`);
      }
      rules.push(`  white-space: nowrap;`);
    } else {
      const parentRect = parentContainer.getBoundingClientRect();
      const relX = activeX - parentRect.left;
      const relY = activeY - parentRect.top;
      const pctX = Math.round(relX / parentRect.width * 100);
      const pctY = Math.round(relY / parentRect.height * 100);
      rules.push(
        `  left: ${pctX}%;`,
        `  top: ${pctY}%;`,
        `  white-space: nowrap;`
      );
    }
    return rules.join("\n");
  }

  // src/overlay.ts
  setupVanillaMonkeyPatch();
  var OverlayEngine = class _OverlayEngine {
    static launchEpoch = 0;
    static activeInstance = null;
    static activeLaunchPromise = null;
    config = null;
    shadowHost = null;
    shadowRoot = null;
    container = null;
    outlineBox = null;
    tooltipBox = null;
    filterPanel = null;
    isFilterPanelVisible = false;
    currentMetadataTypeIndex = 0;
    parentHighlightElements = [];
    uiVisible = true;
    isFrozen = false;
    freezeStyle = null;
    freezeShadowStyle = null;
    launchAbortController = null;
    shortcutsAttached = false;
    modeActivated = false;
    listenersAttached = false;
    isDestroyed = false;
    copyHintTimer = null;
    copyHintTarget = null;
    copyHintOriginalNodes = null;
    inspectorMode = new InspectorAdapter();
    designMode = new DesignAdapter();
    activeMode = this.inspectorMode;
    constructor() {
    }
    static async launch(options) {
      const epoch = ++_OverlayEngine.launchEpoch;
      const prevInstance = _OverlayEngine.activeInstance;
      const prevPromise = _OverlayEngine.activeLaunchPromise;
      _OverlayEngine.activeInstance = null;
      _OverlayEngine.activeLaunchPromise = null;
      prevInstance?.launchAbortController?.abort();
      prevInstance?.destroy();
      let currentPromise;
      currentPromise = (async () => {
        try {
          if (prevPromise) {
            const prior = await prevPromise.catch(() => null);
            prior?.destroy();
          }
          if (_OverlayEngine.launchEpoch !== epoch) {
            return null;
          }
          const engine = new _OverlayEngine();
          _OverlayEngine.activeInstance = engine;
          try {
            await engine.init(options);
          } catch (err) {
            engine.destroy();
            throw err;
          }
          if (_OverlayEngine.launchEpoch !== epoch) {
            engine.destroy();
            return null;
          }
          return engine.isDestroyed ? null : engine;
        } finally {
          if (_OverlayEngine.activeLaunchPromise === currentPromise) {
            _OverlayEngine.activeLaunchPromise = null;
          }
        }
      })();
      _OverlayEngine.activeLaunchPromise = currentPromise;
      return currentPromise;
    }
    static async destroyActive() {
      ++_OverlayEngine.launchEpoch;
      const inst = _OverlayEngine.activeInstance;
      const pending = _OverlayEngine.activeLaunchPromise;
      _OverlayEngine.activeInstance = null;
      _OverlayEngine.activeLaunchPromise = null;
      inst?.launchAbortController?.abort();
      inst?.destroy();
      if (pending) {
        const resolved = await pending.catch(() => null);
        resolved?.destroy();
      }
    }
    handleWindowMessage = (e) => {
      if (e.origin === globalThis.location.origin && e.source === globalThis && e.data?.type === "HOVERSOURCE_CONFIG_CHANGED") {
        this.handleConfigUpdate(e.data.config);
      }
    };
    async init(options) {
      this.launchAbortController = new AbortController();
      await this.loadConfig(options?.configTimeoutMs ?? 2e3, this.launchAbortController.signal);
      if (this.isDestroyed)
        return;
      const bodyReady = await waitForDomBody(options?.domReadyTimeoutMs, this.launchAbortController.signal);
      if (this.isDestroyed)
        return;
      if (!bodyReady) {
        console.warn("[HoverSource] Timed out waiting for document.body; skipping overlay UI mount.");
        return;
      }
      void initInspectorMutationObserver(options?.domReadyTimeoutMs, this.launchAbortController.signal);
      this.createUI();
      this.initStyles();
      this.initShortcuts();
      this.activeMode.activate(this);
      this.modeActivated = true;
      globalThis.addEventListener("pointerover", this.handlePointerOver, { capture: true });
      globalThis.addEventListener("pointermove", this.handlePointerMove, { capture: true });
      globalThis.addEventListener("scroll", this.handleScroll, { capture: true, passive: true });
      globalThis.addEventListener("message", this.handleWindowMessage);
      this.listenersAttached = true;
    }
    handleConfigUpdate(newConfig) {
      console.log("[HoverSource] Live reloading config...", newConfig);
      this.config = newConfig;
      const oldStyle = this.shadowRoot?.getElementById?.("hoversource-styles") ?? this.shadowRoot?.querySelector("#hoversource-styles") ?? document.getElementById("hoversource-styles");
      if (oldStyle)
        oldStyle.remove();
      this.initStyles();
      this.activeMode.onConfigUpdate(newConfig);
    }
    async loadConfig(timeoutMs = 2e3, signal) {
      try {
        const data = await companionRequestJson("/config", { timeoutMs, signal });
        if (data?.config) {
          this.config = data.config;
          console.log("[HoverSource] Configuration loaded from companion server:", this.config);
          return;
        }
      } catch (e) {
        if (!signal?.aborted) {
          console.warn("[HoverSource] Failed to fetch config, falling back to defaults", e);
        }
      }
      this.config = {
        theme: "dark",
        minimalModeByDefault: false,
        snappingThreshold: 15,
        desnappingThreshold: 15,
        maxTraversalDepth: 32,
        shortcuts: {
          toggleUI: { ...DEFAULT_SHORTCUTS.toggleUI },
          toggleMinimal: { ...DEFAULT_SHORTCUTS.toggleMinimal },
          toggleFreeze: { ...DEFAULT_SHORTCUTS.toggleFreeze },
          copyMetadata: { ...DEFAULT_SHORTCUTS.copyMetadata },
          copyAllLayers: { ...DEFAULT_SHORTCUTS.copyAllLayers },
          openDashboard: { ...DEFAULT_SHORTCUTS.openDashboard },
          toggleMode: { ...DEFAULT_SHORTCUTS.toggleMode },
          toggleFilterPanel: { ...DEFAULT_SHORTCUTS.toggleFilterPanel }
        },
        layerPickerScroll: { ...DEFAULT_LAYER_SCROLL_MODIFIERS }
      };
    }
    initStyles() {
      const isLightTheme = this.config?.theme === "light" || this.config?.theme === "system" && !globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
      const colors = isLightTheme ? {
        tooltipBg: "rgba(255, 255, 255, 0.96)",
        tooltipBorder: "rgba(0, 0, 0, 0.15)",
        tooltipText: "#1f2937",
        borderSep: "rgba(0, 0, 0, 0.1)",
        labelColor: "#6b7280",
        stackText: "#374151",
        stackBg: "rgba(0, 0, 0, 0.05)",
        layerShapeFill: "#e5e7eb",
        layerShapeStroke: "rgba(0,0,0,0.35)",
        layerShapeHoverFill: "#d1d5db",
        layerShapeHoverStroke: "rgba(0,0,0,0.6)",
        layerHintColor: "#9ca3af",
        panelBorder: "rgba(37, 99, 235, 0.3)",
        panelGlow: "rgba(37, 99, 235, 0.2)",
        navBg: "rgba(0, 0, 0, 0.05)",
        navHoverBg: "rgba(0, 0, 0, 0.1)",
        accent: "#2563eb",
        accentGlow: "rgba(37, 99, 235, 0.4)",
        accentHover: "#3b82f6",
        rowHoverBg: "rgba(0, 0, 0, 0.02)"
      } : {
        tooltipBg: "rgba(18, 18, 18, 0.95)",
        tooltipBorder: "rgba(255, 255, 255, 0.15)",
        tooltipText: "#f3f4f6",
        borderSep: "rgba(255, 255, 255, 0.1)",
        labelColor: "#9ca3af",
        stackText: "#e5e7eb",
        stackBg: "rgba(255, 255, 255, 0.05)",
        layerShapeFill: "#262626",
        layerShapeStroke: "rgba(255,255,255,0.5)",
        layerShapeHoverFill: "#3f3f46",
        layerShapeHoverStroke: "rgba(255,255,255,0.7)",
        layerHintColor: "#6b7280",
        panelBorder: "rgba(59, 130, 246, 0.3)",
        panelGlow: "rgba(59, 130, 246, 0.2)",
        navBg: "rgba(255, 255, 255, 0.08)",
        navHoverBg: "rgba(255, 255, 255, 0.15)",
        accent: "#3b82f6",
        accentGlow: "rgba(59, 130, 246, 0.4)",
        accentHover: "#60a5fa",
        rowHoverBg: "rgba(255, 255, 255, 0.02)"
      };
      const style = document.createElement("style");
      style.id = "hoversource-styles";
      style.textContent = `
      :host {
        all: initial;
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483647;
      }
      .hoversource-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .hoversource-outline {
        position: absolute;
        border: 2px dashed #3b82f6;
        background-color: rgba(59, 130, 246, 0.1);
        transition: all 0.05s ease-out;
        pointer-events: none;
        box-sizing: border-box;
      }
      .hoversource-parent-outline {
        position: absolute;
        border: 2px dashed #a855f7;
        background-color: rgba(168, 85, 247, 0.05);
        pointer-events: none;
        box-sizing: border-box;
        z-index: 999998;
      }
      .hoversource-parent-svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 1000001;
      }
      .hoversource-leader-line {
        stroke: #a855f7;
        stroke-width: 1.5;
        fill: none;
        stroke-dasharray: 2 2;
      }
      .hoversource-leader-dot {
        fill: #a855f7;
        stroke: #c084fc;
        stroke-width: 1.5;
      }
      .hoversource-parent-badge {
        position: absolute;
        background: #a855f7;
        color: #ffffff;
        font-size: 10px;
        font-family: monospace;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.35);
        pointer-events: auto;
        white-space: nowrap;
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .hoversource-parent-badge-title {
        border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        padding-bottom: 1px;
        margin-bottom: 2px;
        font-weight: bold;
      }
      .hoversource-parent-badge-effect {
        font-size: 9px;
        color: #f3e8ff;
      }
      .hoversource-parent-item:hover {
        background: rgba(168, 85, 247, 0.15) !important;
        color: #c084fc !important;
      }
      .hoversource-parent-item.hs-parent-active {
        background: rgba(168, 85, 247, 0.25) !important;
        border: 1px dashed #c084fc !important;
        color: #ffffff !important;
        border-radius: 4px;
        padding-left: 6px;
        transition: all 0.15s ease;
      }
      .hoversource-tooltip {
        position: absolute;
        background: ${colors.tooltipBg};
        backdrop-filter: blur(8px);
        border: 1px solid ${colors.tooltipBorder};
        color: ${colors.tooltipText};
        padding: 12px;
        border-radius: 8px;
        font-size: 11px;
        max-width: 460px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
        z-index: 1000000;
        line-height: 1.4;
      }
      .hoversource-title {
        font-weight: bold;
        font-size: 13px;
        color: #3b82f6;
        margin-bottom: 6px;
        border-bottom: 1px solid ${colors.borderSep};
        padding-bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hoversource-framework {
        font-size: 9px;
        background: #1e3a8a;
        color: #93c5fd;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .hoversource-section { margin-top: 6px; }
      .hoversource-label { color: ${colors.labelColor}; font-weight: 500; }
      .hoversource-value { font-family: monospace; color: #10b981; word-break: break-all; }
      .hoversource-link { color: #2563eb; text-decoration: underline; cursor: pointer; }
      .hoversource-link:hover { color: #3b82f6; }
      .hoversource-stack { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
      .hoversource-stack-item {
        font-family: monospace;
        color: ${colors.stackText};
        background: ${colors.stackBg};
        padding: 2px 4px;
        border-radius: 3px;
      }
      .hs-layer-column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding-top: 4px;
        flex-shrink: 0;
      }
      .hs-layer-dot {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 12px;
        cursor: pointer;
        border-radius: 3px;
        position: relative;
        margin-top: -7px;
        transition: transform 0.12s, z-index 0.12s;
      }
      .hs-layer-dot:first-child {
        margin-top: 0;
      }
      .hs-layer-dot:hover {
        transform: translateY(-3px);
        z-index: 100 !important;
      }
      .hs-layer-dot svg {
        overflow: visible;
      }
      .hs-layer-shape {
        fill: ${colors.layerShapeFill};
        stroke: ${colors.layerShapeStroke};
        stroke-width: 1.5;
        transition: fill 0.12s, stroke 0.12s;
      }
      .hs-layer-dot:hover .hs-layer-shape {
        fill: ${colors.layerShapeHoverFill};
        stroke: ${colors.layerShapeHoverStroke};
      }
      .hs-layer-dot--active .hs-layer-shape {
        fill: #3b82f6;
        stroke: #60a5fa;
      }
      .hs-layer-dot--active:hover .hs-layer-shape {
        fill: #2563eb;
        stroke: #3b82f6;
      }
      .hs-layer-dot--active svg {
        filter: drop-shadow(0 1px 3px rgba(59, 130, 246, 0.4));
      }
      .hs-layer-hint {
        font-size: 8px;
        color: ${colors.layerHintColor};
        text-align: center;
        margin-top: 2px;
        white-space: nowrap;
      }
      .hs-tooltip-content-wrapper {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .hoversource-tooltip.hs-tooltip-above .hs-tooltip-content-wrapper {
        align-items: flex-end;
      }
      .hoversource-shortcut-hint {
        margin-top: 8px;
        font-size: 9px;
        color: #6b7280;
        text-align: right;
        border-top: 1px dashed ${colors.borderSep};
        padding-top: 4px;
      }
      .hoversource-config-panel {
        position: fixed;
        width: 280px;
        background: ${colors.tooltipBg};
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid ${colors.panelBorder};
        color: ${colors.tooltipText};
        padding: 10px 12px;
        border-radius: 8px;
        box-shadow: 0 0 12px ${colors.panelGlow}, 0 8px 20px -5px rgba(0, 0, 0, 0.5);
        z-index: 1000000;
        user-select: none;
        box-sizing: border-box;
        pointer-events: auto;
      }
      .hoversource-config-panel .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        border-bottom: 1px solid ${colors.borderSep};
        padding-bottom: 4px;
        cursor: move;
      }
      .hoversource-config-panel .nav-btn {
        background: ${colors.navBg};
        border: 1px solid ${colors.borderSep};
        color: ${colors.tooltipText};
        cursor: pointer;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 3px;
        transition: all 0.2s ease;
      }
      .hoversource-config-panel .nav-btn:hover {
        background: ${colors.navHoverBg};
      }
      .hoversource-config-panel .title {
        font-weight: 700;
        font-size: 11.5px;
        color: ${colors.accent};
        text-shadow: 0 0 6px ${colors.accentGlow};
        letter-spacing: 0.02em;
      }
      .hoversource-config-panel table {
        width: 100%;
        border-collapse: collapse;
      }
      .hoversource-config-panel tr {
        transition: background-color 0.15s ease;
      }
      .hoversource-config-panel tr:hover {
        background-color: ${colors.rowHoverBg};
      }
      .hoversource-config-panel td {
        padding: 4px 0;
        font-size: 10.5px;
        vertical-align: middle;
      }
      .hoversource-config-panel td.label-col {
        color: ${colors.labelColor};
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hoversource-config-panel tr:hover td.label-col {
        color: ${colors.tooltipText};
      }
      .hoversource-config-panel td.check-col {
        text-align: right;
        width: 24px;
      }
      .hoversource-config-panel .icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${colors.accent};
        width: 12px;
        height: 12px;
        opacity: 0.75;
      }
      .hoversource-config-panel tr:hover .icon-wrapper {
        color: ${colors.accentHover};
      }
      .hoversource-config-panel tr.hs-row-disabled {
        opacity: 0.5;
      }
      .hoversource-config-panel input[type="checkbox"] {
        cursor: pointer;
        accent-color: ${colors.accent};
        width: 12px;
        height: 12px;
      }
    `;
      if (this.shadowRoot) {
        this.shadowRoot.appendChild(style);
      } else if (this.container) {
        this.container.appendChild(style);
      } else if (document.head) {
        document.head.appendChild(style);
      }
    }
    createUI() {
      if (this.shadowHost || this.container || !document.body)
        return;
      this.shadowHost = document.createElement("div");
      this.shadowHost.id = "hoversource-host";
      this.shadowRoot = this.shadowHost.attachShadow({ mode: "open" });
      this.container = document.createElement("div");
      this.container.className = "hoversource-container";
      this.outlineBox = document.createElement("div");
      this.outlineBox.className = "hoversource-outline";
      this.outlineBox.style.display = "none";
      this.container.appendChild(this.outlineBox);
      this.tooltipBox = document.createElement("div");
      this.tooltipBox.className = "hoversource-tooltip";
      this.tooltipBox.style.display = "none";
      this.tooltipBox.addEventListener("click", (e) => {
        const target = e.target;
        const link = target?.closest?.("[data-hs-open-file]");
        if (!link)
          return;
        const file = link.dataset.hsOpenFile;
        if (!file)
          return;
        const line = Number.parseInt(link.dataset.hsOpenLine || "1", 10) || 1;
        const col = Number.parseInt(link.dataset.hsOpenCol || "1", 10) || 1;
        const tagName = link.dataset.hsOpenTag || "";
        const classList = link.dataset.hsOpenClasses || "";
        openFileInIde(file, line, col, tagName, classList);
      });
      this.container.appendChild(this.tooltipBox);
      this.filterPanel = document.createElement("div");
      this.filterPanel.className = "hoversource-config-panel";
      this.filterPanel.style.display = "none";
      this.container.appendChild(this.filterPanel);
      this.shadowRoot.appendChild(this.container);
      document.body.appendChild(this.shadowHost);
    }
    ensureUI() {
      if (!document.body)
        return;
      if (this.shadowHost && !document.body.contains(this.shadowHost)) {
        console.log("[HoverSource] Self-healing: Restored overlay container to DOM.");
        document.body.appendChild(this.shadowHost);
      }
    }
    initShortcuts() {
      globalThis.addEventListener("keydown", this.handleKeyDown);
      this.shortcutsAttached = true;
    }
    handleModeShortcuts(e, shortcuts) {
      const toggleModeShortcut = shortcuts.toggleMode ?? DEFAULT_SHORTCUTS.toggleMode;
      if (matchShortcut(e, shortcuts.openDashboard ?? DEFAULT_SHORTCUTS.openDashboard)) {
        e.preventDefault();
        console.log("[HoverSource] Shortcut matched: openDashboard");
        this.openDashboardInBrowser();
      } else if (matchShortcut(e, toggleModeShortcut)) {
        e.preventDefault();
        this.switchMode();
      } else if (matchShortcut(e, shortcuts.toggleMinimal ?? DEFAULT_SHORTCUTS.toggleMinimal)) {
        e.preventDefault();
        this.activeMode.onShortcut("toggleMinimal");
      } else if (matchShortcut(e, shortcuts.toggleFreeze ?? DEFAULT_SHORTCUTS.toggleFreeze)) {
        e.preventDefault();
        this.activeMode.onShortcut("toggleFreeze");
      } else if (matchShortcut(e, shortcuts.copyMetadata ?? DEFAULT_SHORTCUTS.copyMetadata)) {
        e.preventDefault();
        this.activeMode.onShortcut("copyMetadata");
      } else if (matchShortcut(e, shortcuts.copyAllLayers ?? DEFAULT_SHORTCUTS.copyAllLayers)) {
        e.preventDefault();
        this.activeMode.onShortcut("copyAllLayers");
      }
    }
    handleKeyDown = (e) => {
      const shortcuts = this.config?.shortcuts;
      if (matchShortcut(e, shortcuts?.toggleFilterPanel ?? DEFAULT_SHORTCUTS.toggleFilterPanel)) {
        e.preventDefault();
        this.toggleFilterPanel();
        return;
      }
      if (!shortcuts)
        return;
      if (matchShortcut(e, shortcuts.toggleUI ?? DEFAULT_SHORTCUTS.toggleUI)) {
        e.preventDefault();
        this.uiVisible = !this.uiVisible;
        if (this.container) {
          this.container.style.display = this.uiVisible ? "block" : "none";
        }
        console.log(`[HoverSource] UI Tooltip Visibility: ${this.uiVisible ? "visible" : "hidden"} (Background tracking active)`);
        this.activeMode.onUIVisibilityChanged(this.uiVisible);
        return;
      }
      if (this.isTyping(e))
        return;
      this.handleModeShortcuts(e, shortcuts);
    };
    toggleFilterPanel() {
      if (!this.filterPanel)
        return;
      this.isFilterPanelVisible = !this.isFilterPanelVisible;
      if (this.isFilterPanelVisible) {
        this.filterPanel.style.display = "block";
        const savedPos = this.config?.metadataFilter?.panelPosition;
        if (savedPos) {
          this.filterPanel.style.left = savedPos.x + "px";
          this.filterPanel.style.top = savedPos.y + "px";
          this.filterPanel.style.right = "auto";
        } else {
          this.filterPanel.style.top = "100px";
          this.filterPanel.style.right = "40px";
          this.filterPanel.style.left = "auto";
        }
        this.renderFilterPanel();
      } else {
        this.filterPanel.style.display = "none";
      }
    }
    renderFilterPanel(restoreFocusId) {
      if (!this.filterPanel)
        return;
      const metadataTypes = [
        { id: "component", name: "Component Metadata" },
        { id: "layer", name: "Layer Stack Metadata" },
        { id: "design", name: "Design Placement" }
      ];
      const activeType = metadataTypes[this.currentMetadataTypeIndex];
      const fieldsMap = {
        component: [
          { key: "componentName", label: "Component Name" },
          { key: "elementSelector", label: "Element Selector" },
          { key: "filePath", label: "File Path & Line" },
          { key: "framework", label: "Framework" },
          { key: "dimensions", label: "Dimensions" },
          { key: "keyStyles", label: "Key Styles" },
          { key: "parentStyles", label: "Parent Styles" },
          { key: "layoutConstraints", label: "Layout Constraints" },
          { key: "sourceComments", label: "Source Comments" },
          { key: "sourceAttributes", label: "Source Attributes" }
        ],
        layer: [
          { key: "layerSummary", label: "Layers Summary" },
          { key: "layer1", label: "Layer 1: Leaf" },
          { key: "layer2", label: "Layer 2: Parents" },
          { key: "htmlStructure", label: "HTML Structure Block" }
        ],
        design: [
          { key: "compInfo", label: "Component & Element" },
          { key: "horizontalAnchor", label: "Horizontal Anchor" },
          { key: "verticalAnchor", label: "Vertical Anchor" },
          { key: "layoutContext", label: "Layout Context" },
          { key: "suggestedCss", label: "Suggested CSS Block" },
          { key: "sourceFiles", label: "Source Files" },
          { key: "aiInstructions", label: "AI Instructions" }
        ]
      };
      const iconsMap = {
        componentName: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
        elementSelector: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 6h15m-1.875-10.5l-3.375 15m-1.5-15l-3.375 15" /></svg>`,
        filePath: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`,
        framework: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l8.97-8.97m-8.97 8.97L15 15M9 21l-3.75-3.75M5.25 17.25L13.5 9M18.75 5.25l-.323.323m0 0a1.875 1.875 0 11-2.652-2.652L16.1 3.25m2.652 2.652L19.5 5.25m-3.077-1.427L15.6 4.5m0 0l-1.5-1.5M16.1 3.25l-1.427 1.427m3.077 1.427l1.5 1.5" /></svg>`,
        dimensions: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v16.5m0-16.5h16.5m-16.5 0L19.5 19.5M19.5 3.75v16.5m0-16.5H3.75m15.75 15.75H3.75" /></svg>`,
        keyStyles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 00-2.225.016 9.778 9.778 0 00-2.524 1.307c-.152.1-.347.052-.44-.1a9.033 9.033 0 01-1.19-4.358 9 9 0 0117.189-3.674a5.006 5.006 0 00-.834-.055 3.99 3.99 0 00-2.827 1.172 5.006 5.006 0 00-1.172 2.827 3.99 3.99 0 001.172 2.827c.29.29.616.536.969.736a9.07 9.07 0 01-5.267 1.258c-.347-.008-.7-.04-1.045-.097z" /></svg>`,
        parentStyles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.999 5.999 0 00-5.414-5.74M6 18.72a9.094 9.094 0 01-3.741-.479 3 3 0 014.682-2.72m-.94 3.198l-.002.031c0 .225.012.447.038.666A11.944 11.944 0 0012 21c2.17 0 4.207-.576 5.963-1.584A6.062 6.062 0 0018 18.719m-12 0a5.999 5.999 0 015.414-5.74m0 0a3 3 0 110-6 3 3 0 010 6z" /></svg>`,
        layoutConstraints: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3 3m12 6V4.5M15 9h4.5M15 9l6-6M9 15v4.5M9 15H4.5M9 15l-6 6m12-6v4.5M15 15h4.5M15 15l6 6" /></svg>`,
        sourceComments: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>`,
        sourceAttributes: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.65 1.65 0 002.333 0l4.318-4.318a1.65 1.65 0 000-2.333L10.312 4.319a2.25 2.25 0 00-1.591-.659z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 7.5h.008v.008H6V7.5z" /></svg>`,
        layerSummary: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m11.142 0L21.75 12l-4.179-2.25M12 5.75L6.429 9.75 12 13.75l5.571-4L12 5.75zm0 8l-5.571 4L12 21.75l5.571-4-5.571-4z" /></svg>`,
        layer1: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" /></svg>`,
        layer2: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" /></svg>`,
        htmlStructure: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>`,
        compInfo: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>`,
        horizontalAnchor: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>`,
        verticalAnchor: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>`,
        layoutContext: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V7.125z" /></svg>`,
        suggestedCss: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
        sourceFiles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>`,
        aiInstructions: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
      };
      const fields = fieldsMap[activeType.id] || [];
      const rowNodes = fields.map((field) => {
        const filtersObj = this.config?.metadataFilter?.filters?.[activeType.id];
        const isChecked = filtersObj ? filtersObj[field.key] !== false : true;
        const svgIcon = iconsMap[field.key] || "";
        return el(
          "tr",
          { class: isChecked ? "" : "hs-row-disabled", style: "cursor: pointer;" },
          [
            el("td", { class: "label-col" }, [
              el("span", { class: "icon-wrapper" }, [
                svgIcon ? createSafeFragmentFromHtml(svgIcon) : null
              ]),
              el("span", {}, [field.label])
            ]),
            el("td", { class: "check-col" }, [
              el("input", {
                type: "checkbox",
                "data-type": activeType.id,
                "data-field": field.key,
                checked: isChecked
              })
            ])
          ]
        );
      });
      const headerEl = el("div", { class: "header", id: "hoversource-drag-header" }, [
        el(
          "button",
          {
            type: "button",
            class: "nav-btn",
            id: "hoversource-prev-btn",
            "aria-label": "Previous metadata category"
          },
          ["<"]
        ),
        el("div", { class: "title" }, [activeType.name]),
        el(
          "button",
          {
            type: "button",
            class: "nav-btn",
            id: "hoversource-next-btn",
            "aria-label": "Next metadata category"
          },
          [">"]
        )
      ]);
      const tableContainerEl = el("div", { class: "table-container" }, [
        el("table", {}, rowNodes)
      ]);
      this.filterPanel.replaceChildren(
        ...[headerEl, tableContainerEl].filter((n) => n !== null)
      );
      const prevBtn = this.filterPanel.querySelector("#hoversource-prev-btn");
      const nextBtn = this.filterPanel.querySelector("#hoversource-next-btn");
      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          const activeEl = this.shadowRoot?.activeElement ?? document.activeElement;
          const shouldRestoreFocus = activeEl === prevBtn;
          this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex - 1 + metadataTypes.length) % metadataTypes.length;
          this.renderFilterPanel(shouldRestoreFocus ? "hoversource-prev-btn" : void 0);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          const activeEl = this.shadowRoot?.activeElement ?? document.activeElement;
          const shouldRestoreFocus = activeEl === nextBtn;
          this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex + 1 + metadataTypes.length) % metadataTypes.length;
          this.renderFilterPanel(shouldRestoreFocus ? "hoversource-next-btn" : void 0);
        });
      }
      const rows = this.filterPanel.querySelectorAll("tr");
      rows.forEach((row) => {
        const cb = row.querySelector("input[type='checkbox']");
        if (!cb)
          return;
        row.addEventListener("click", (e) => {
          if (e.target === cb)
            return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        });
      });
      const checkboxes = this.filterPanel.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const type = cb.dataset.type;
          const field = cb.dataset.field;
          const checked = cb.checked;
          const row = cb.closest("tr");
          if (row) {
            if (checked) {
              row.classList.remove("hs-row-disabled");
            } else {
              row.classList.add("hs-row-disabled");
            }
          }
          const delta = {
            metadataFilter: {
              filters: {
                [type]: {
                  [field]: checked
                }
              }
            }
          };
          this.saveConfig(delta);
        });
      });
      this.makePanelDraggable();
      if (restoreFocusId) {
        this.filterPanel.querySelector(`#${restoreFocusId}`)?.focus();
      }
    }
    makePanelDraggable() {
      if (!this.filterPanel)
        return;
      const header = this.filterPanel.querySelector("#hoversource-drag-header");
      if (!header)
        return;
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      header.onmousedown = (e) => {
        if (e.target && (e.target.tagName.toLowerCase() === "button" || e.target.closest("button")))
          return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = () => {
          document.onmouseup = null;
          document.onmousemove = null;
          if (this.filterPanel) {
            const delta = {
              metadataFilter: {
                panelPosition: {
                  x: this.filterPanel.offsetLeft,
                  y: this.filterPanel.offsetTop
                }
              }
            };
            this.saveConfig(delta);
          }
        };
        document.onmousemove = (ev) => {
          ev.preventDefault();
          pos1 = pos3 - ev.clientX;
          pos2 = pos4 - ev.clientY;
          pos3 = ev.clientX;
          pos4 = ev.clientY;
          if (this.filterPanel) {
            this.filterPanel.style.top = this.filterPanel.offsetTop - pos2 + "px";
            this.filterPanel.style.left = this.filterPanel.offsetLeft - pos1 + "px";
            this.filterPanel.style.right = "auto";
          }
        };
      };
    }
    switchMode() {
      this.activeMode.deactivate();
      this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
      this.activeMode.activate(this);
    }
    openDashboardInBrowser() {
      companionRequestJson("/open-dashboard").then((data) => {
        if (data.success) {
          console.log("[HoverSource] Triggered dashboard browser open.");
        } else {
          console.error("[HoverSource] Failed to open dashboard:", data.error);
        }
      }).catch((e) => {
        console.error("[HoverSource] Failed to request dashboard open:", e);
      });
    }
    isTyping(e) {
      const activeEl = this.shadowRoot?.activeElement ?? document.activeElement;
      if (!activeEl)
        return false;
      const tag = activeEl.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
    }
    handlePointerOver = (e) => {
      this.ensureUI();
      const target = e.target;
      const composedPath = typeof e.composedPath === "function" ? e.composedPath() : [];
      const isOverlayEvent = Boolean(
        this.shadowHost && (target === this.shadowHost || this.shadowHost.contains(target) || composedPath.includes(this.shadowHost)) || this.container && (target === this.container || this.container.contains(target) || composedPath.includes(this.container))
      );
      if (isOverlayEvent)
        return;
      if (!target) {
        if (this.isFrozen) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
        return;
      }
      this.activeMode.onPointerOver(e, target);
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    handlePointerMove = (e) => {
      this.ensureUI();
      this.activeMode.onPointerMove(e);
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    handleScroll = (e) => {
      if (this.activeMode.onScroll) {
        this.activeMode.onScroll(e);
      }
    };
    blockEvent = (e) => {
      const target = e.target;
      const composedPath = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (this.shadowHost && (target === this.shadowHost || this.shadowHost.contains(target) || composedPath.includes(this.shadowHost)) || this.container && (target === this.container || this.container.contains(target) || composedPath.includes(this.container))) {
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    // --- OverlayController Implementation ---
    drawHighlight(target, isFrozen) {
      if (!this.outlineBox)
        return;
      const rect = target.getBoundingClientRect();
      this.outlineBox.style.width = `${rect.width}px`;
      this.outlineBox.style.height = `${rect.height}px`;
      this.outlineBox.style.left = `${rect.left}px`;
      this.outlineBox.style.top = `${rect.top}px`;
      this.outlineBox.style.display = "block";
      this.outlineBox.style.borderColor = isFrozen ? "#f59e0b" : "#3b82f6";
      this.outlineBox.style.backgroundColor = isFrozen ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.1)";
    }
    drawTooltip(html, pointerEvent) {
      if (!this.tooltipBox)
        return;
      if (html) {
        if (this.copyHintTimer !== null) {
          clearTimeout(this.copyHintTimer);
          this.copyHintTimer = null;
        }
        this.copyHintTarget = null;
        this.copyHintOriginalNodes = null;
        setElementContentSafely(this.tooltipBox, html);
        if (this.tooltipBox.style.display !== "block") {
          this.tooltipBox.style.display = "block";
        }
      }
      if (pointerEvent.clientX !== 0 || pointerEvent.clientY !== 0) {
        this.positionTooltip(pointerEvent);
      }
    }
    positionTooltip(e) {
      if (!this.tooltipBox)
        return;
      const padding = 15;
      const boxRect = this.tooltipBox.getBoundingClientRect();
      let x = e.clientX + padding;
      if (x + boxRect.width > window.innerWidth) {
        x = e.clientX - boxRect.width - padding;
      }
      const maxX = Math.max(0, window.innerWidth - boxRect.width);
      x = Math.max(0, Math.min(x, maxX));
      const fitsBelow = e.clientY + padding + boxRect.height <= window.innerHeight;
      const fitsAbove = e.clientY - padding - boxRect.height >= 0;
      let isAbove = false;
      if (!fitsBelow && fitsAbove) {
        isAbove = true;
      } else if (!fitsBelow && !fitsAbove) {
        const spaceBelow = window.innerHeight - (e.clientY + padding);
        const spaceAbove = e.clientY - padding;
        if (spaceAbove > spaceBelow) {
          isAbove = true;
        }
      }
      let y = isAbove ? e.clientY - boxRect.height - padding : e.clientY + padding;
      const maxY = Math.max(0, window.innerHeight - boxRect.height);
      y = Math.max(0, Math.min(y, maxY));
      this.tooltipBox.classList.toggle("hs-tooltip-above", isAbove);
      this.tooltipBox.style.left = `${x}px`;
      this.tooltipBox.style.top = `${y}px`;
    }
    drawLeaderLine(subRect, rowRect) {
      if (!this.container)
        return;
      const x1 = subRect.left + subRect.width / 2;
      const y1 = subRect.top + subRect.height / 2;
      let isInsideTooltip = false;
      let tooltipRect = null;
      if (this.tooltipBox && this.tooltipBox.style.display !== "none") {
        tooltipRect = this.tooltipBox.getBoundingClientRect();
        if (x1 >= tooltipRect.left && x1 <= tooltipRect.right && y1 >= tooltipRect.top && y1 <= tooltipRect.bottom) {
          isInsideTooltip = true;
        }
      }
      if (!isInsideTooltip) {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "hoversource-parent-svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        this.container.appendChild(svg);
        this.parentHighlightElements.push(svg);
        let rx = rowRect.left;
        if (tooltipRect && x1 > tooltipRect.left + tooltipRect.width / 2) {
          rx = rowRect.right;
        }
        const ry = rowRect.top + rowRect.height / 2;
        const dotCircle = document.createElementNS(svgNS, "circle");
        dotCircle.setAttribute("cx", x1.toString());
        dotCircle.setAttribute("cy", y1.toString());
        dotCircle.setAttribute("r", "5");
        dotCircle.setAttribute("class", "hoversource-leader-dot");
        svg.appendChild(dotCircle);
        const dotInner = document.createElementNS(svgNS, "circle");
        dotInner.setAttribute("cx", x1.toString());
        dotInner.setAttribute("cy", y1.toString());
        dotInner.setAttribute("r", "1.5");
        dotInner.setAttribute("fill", "#ffffff");
        svg.appendChild(dotInner);
        const dx = rx - x1;
        const dir = dx > 0 ? 1 : -1;
        let x_mid = x1 + dir * 30;
        if (Math.abs(dx) <= 60) {
          x_mid = x1 + dx * 0.5;
        }
        x_mid = Math.max(10, Math.min(x_mid, window.innerWidth - 10));
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", `M ${x1} ${y1} L ${x_mid} ${ry} L ${rx} ${ry}`);
        path.setAttribute("class", "hoversource-leader-line");
        svg.appendChild(path);
      }
    }
    drawParentHighlight(fx, rowRect) {
      if (!this.container || fx?.element?.nodeType !== 1)
        return;
      const prop = fx.property;
      const isVisualEffect = prop === "mask-image" || prop === "clip-path" || prop.startsWith("overflow");
      if (!isVisualEffect)
        return;
      const parentEl = fx.element;
      const rect = parentEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0)
        return;
      let subRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      if (prop === "mask-image") {
        const parsed = parseMaskGradient(fx.value, rect);
        if (parsed)
          subRect = parsed;
      } else if (prop === "clip-path") {
        const parsed = parseClipPathInset(fx.value, rect);
        if (parsed)
          subRect = parsed;
      }
      const frame = document.createElement("div");
      frame.className = "hoversource-parent-outline";
      frame.style.width = `${subRect.width}px`;
      frame.style.height = `${subRect.height}px`;
      frame.style.left = `${subRect.left}px`;
      frame.style.top = `${subRect.top}px`;
      this.container.appendChild(frame);
      this.parentHighlightElements.push(frame);
      if (rowRect) {
        this.drawLeaderLine(subRect, rowRect);
      }
    }
    clearParentHighlights() {
      for (const el2 of this.parentHighlightElements) {
        el2.remove();
      }
      this.parentHighlightElements = [];
    }
    clear() {
      if (this.outlineBox)
        this.outlineBox.style.display = "none";
      if (this.tooltipBox)
        this.tooltipBox.style.display = "none";
      this.clearParentHighlights();
    }
    async copyToClipboard(text) {
      await navigator.clipboard.writeText(text);
      if (this.isDestroyed)
        return;
      console.log("[HoverSource] Copied component metadata to clipboard!");
      if (this.uiVisible && this.tooltipBox) {
        const hint = this.tooltipBox.querySelector(".hoversource-shortcut-hint");
        if (hint) {
          if (this.copyHintTimer !== null) {
            clearTimeout(this.copyHintTimer);
            this.copyHintTimer = null;
          }
          const originalNodes = this.copyHintTarget === hint && this.copyHintOriginalNodes ? this.copyHintOriginalNodes : Array.from(hint.childNodes).map((n) => n.cloneNode(true));
          this.copyHintTarget = hint;
          this.copyHintOriginalNodes = originalNodes;
          const copiedSpan = el(
            "span",
            { style: "color: #10b981; font-weight: bold;" },
            ["Copied successfully for AI!"]
          );
          if (copiedSpan) {
            hint.replaceChildren(copiedSpan);
          }
          this.copyHintTimer = setTimeout(() => {
            this.copyHintTimer = null;
            if (this.isDestroyed)
              return;
            if (this.copyHintTarget === hint) {
              hint.replaceChildren(...originalNodes);
              this.copyHintTarget = null;
              this.copyHintOriginalNodes = null;
            }
          }, 1500);
        }
      }
    }
    getConfig() {
      return this.config;
    }
    async saveConfig(newConfig) {
      try {
        const data = await companionRequestJson("/config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            config: newConfig,
            target: "local"
          })
        });
        if (data.success && data.config) {
          this.config = data.config;
        }
      } catch (e) {
        console.error("[HoverSource] Failed to save config", e);
      }
    }
    isUIVisible() {
      return this.uiVisible;
    }
    setFreezeMode(frozen) {
      if (this.isFrozen === frozen)
        return;
      this.isFrozen = frozen;
      const events = [
        "pointerout",
        "mouseout",
        "pointerleave",
        "mouseleave",
        "pointerenter",
        "mouseenter",
        "mousedown",
        "mouseup",
        "click",
        "contextmenu",
        "mousemove",
        "mouseover"
      ];
      if (this.isFrozen) {
        events.forEach((event) => globalThis.addEventListener(event, this.blockEvent, { capture: true }));
        this.freezeStyle = document.createElement("style");
        this.freezeStyle.id = "hoversource-freeze-styles";
        this.freezeStyle.textContent = `
        * { pointer-events: auto !important; }
        #hoversource-host { pointer-events: none !important; }
      `;
        (document.head ?? document.documentElement)?.appendChild(this.freezeStyle);
        if (this.shadowRoot) {
          this.freezeShadowStyle = document.createElement("style");
          this.freezeShadowStyle.id = "hoversource-freeze-shadow-styles";
          this.freezeShadowStyle.textContent = `
          .hoversource-container, .hoversource-outline { pointer-events: none !important; }
          .hoversource-tooltip, .hoversource-tooltip *, .hoversource-config-panel, .hoversource-config-panel *, .hoversource-parent-badge, .hoversource-parent-badge * { pointer-events: auto !important; }
        `;
          this.shadowRoot.appendChild(this.freezeShadowStyle);
        }
      } else {
        events.forEach((event) => globalThis.removeEventListener(event, this.blockEvent, { capture: true }));
        if (this.freezeStyle) {
          this.freezeStyle.remove();
          this.freezeStyle = null;
        }
        if (this.freezeShadowStyle) {
          this.freezeShadowStyle.remove();
          this.freezeShadowStyle = null;
        }
      }
    }
    destroy() {
      if (this.isDestroyed)
        return;
      this.isDestroyed = true;
      this.launchAbortController?.abort();
      this.launchAbortController = null;
      disconnectInspectorMutationObserver();
      this.setFreezeMode(false);
      if (this.modeActivated) {
        this.activeMode.deactivate();
        this.modeActivated = false;
      }
      if (this.shortcutsAttached) {
        globalThis.removeEventListener("keydown", this.handleKeyDown);
        this.shortcutsAttached = false;
      }
      if (this.listenersAttached) {
        globalThis.removeEventListener("pointerover", this.handlePointerOver, { capture: true });
        globalThis.removeEventListener("pointermove", this.handlePointerMove, { capture: true });
        globalThis.removeEventListener("scroll", this.handleScroll, { capture: true });
        globalThis.removeEventListener("message", this.handleWindowMessage);
        this.listenersAttached = false;
      }
      if (typeof document !== "undefined") {
        document.onmouseup = null;
        document.onmousemove = null;
      }
      if (this.copyHintTimer !== null) {
        clearTimeout(this.copyHintTimer);
        this.copyHintTimer = null;
      }
      this.copyHintTarget = null;
      this.copyHintOriginalNodes = null;
      this.shadowHost?.remove();
      this.container?.remove();
      this.freezeStyle?.remove();
      this.freezeShadowStyle?.remove();
      this.shadowHost = null;
      this.shadowRoot = null;
      this.container = null;
      this.outlineBox = null;
      this.tooltipBox = null;
      this.filterPanel = null;
      this.freezeStyle = null;
      this.freezeShadowStyle = null;
      this.parentHighlightElements = [];
      if (_OverlayEngine.activeInstance === this) {
        _OverlayEngine.activeInstance = null;
      }
    }
  };
  function openFileInIde(file, line, col, tagName, classList) {
    let path = `/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
    if (tagName)
      path += `&tagName=${encodeURIComponent(tagName)}`;
    if (classList)
      path += `&classList=${encodeURIComponent(classList)}`;
    companionRequestJson(path).then((data) => {
      if (data.success) {
        console.log(`[HoverSource] Opened file in editor: ${file}`);
      } else {
        console.error("[HoverSource] Editor open failed:", data.error);
      }
    }).catch((e) => console.error("[HoverSource] Failed to reach companion server:", e));
  }
  globalThis.__HoverSourceOpen__ = openFileInIde;
  if (typeof document !== "undefined" && !globalThis.__HoverSourceInitialized__) {
    globalThis.__HoverSourceInitialized__ = true;
    void OverlayEngine.launch().catch((err) => {
      console.error("[HoverSource] Overlay initialization failed:", err);
    });
    console.log("[HoverSource] Overlay injected.");
  }
  function calculateMaskBounds(direction, stopValue, stopUnit, rect) {
    let subLeft = rect.left;
    let subTop = rect.top;
    let subWidth = rect.width;
    let subHeight = rect.height;
    const rectBottom = rect.bottom === void 0 ? rect.top + rect.height : rect.bottom;
    const rectRight = rect.right === void 0 ? rect.left + rect.width : rect.right;
    if (direction === "to bottom") {
      const h = stopUnit === "px" ? stopValue : rect.height * (stopValue / 100);
      subHeight = Math.min(h, rect.height);
    } else if (direction === "to top") {
      const h = stopUnit === "px" ? stopValue : rect.height * (stopValue / 100);
      subHeight = Math.min(h, rect.height);
      subTop = rectBottom - subHeight;
    } else if (direction === "to right") {
      const w = stopUnit === "px" ? stopValue : rect.width * (stopValue / 100);
      subWidth = Math.min(w, rect.width);
    } else if (direction === "to left") {
      const w = stopUnit === "px" ? stopValue : rect.width * (stopValue / 100);
      subWidth = Math.min(w, rect.width);
      subLeft = rectRight - subWidth;
    }
    return { left: subLeft, top: subTop, width: subWidth, height: subHeight };
  }
  function parseMaskGradient(value, rect) {
    if (!value?.includes("linear-gradient"))
      return null;
    const matches = Array.from(value.matchAll(/(\d{1,10}(?:\.\d{1,10})?)(px|%)/g));
    if (matches.length === 0)
      return null;
    let stopValue = 0;
    let stopUnit = "px";
    for (const m of matches) {
      const val = Number.parseFloat(m[1]);
      if (val > 0) {
        stopValue = val;
        stopUnit = m[2];
        break;
      }
    }
    if (stopValue === 0)
      return null;
    let direction = "to bottom";
    if (value.includes("to top"))
      direction = "to top";
    else if (value.includes("to right"))
      direction = "to right";
    else if (value.includes("to left"))
      direction = "to left";
    return calculateMaskBounds(direction, stopValue, stopUnit, rect);
  }
  function parseClipPathInset(value, rect) {
    if (!value?.includes("inset("))
      return null;
    const insetMatch = /inset\(([^)]+)\)/.exec(value);
    if (!insetMatch)
      return null;
    let content = insetMatch[1].split("round")[0].trim();
    const tokens = content.split(/\s+/).filter((t2) => t2.length > 0);
    if (tokens.length === 0)
      return null;
    const parseVal = (token, size) => {
      const num = Number.parseFloat(token);
      if (Number.isNaN(num))
        return 0;
      if (token.includes("%"))
        return size * (num / 100);
      return num;
    };
    let t = 0, r = 0, b = 0, l = 0;
    if (tokens.length === 1) {
      t = r = b = l = parseVal(tokens[0], Math.min(rect.width, rect.height));
    } else if (tokens.length === 2) {
      t = b = parseVal(tokens[0], rect.height);
      l = r = parseVal(tokens[1], rect.width);
    } else if (tokens.length === 3) {
      t = parseVal(tokens[0], rect.height);
      l = r = parseVal(tokens[1], rect.width);
      b = parseVal(tokens[2], rect.height);
    } else if (tokens.length >= 4) {
      t = parseVal(tokens[0], rect.height);
      r = parseVal(tokens[1], rect.width);
      b = parseVal(tokens[2], rect.height);
      l = parseVal(tokens[3], rect.width);
    }
    return {
      left: rect.left + l,
      top: rect.top + t,
      width: Math.max(0, rect.width - l - r),
      height: Math.max(0, rect.height - t - b)
    };
  }
})();
