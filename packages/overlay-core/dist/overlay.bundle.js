"use strict";
(() => {
  // src/vanillaPatch.ts
  function setupVanillaMonkeyPatch() {
    if (typeof document === "undefined")
      return;
    if (globalThis.__HOVERSOURCE_VANILLA_PATCHED__)
      return;
    globalThis.__HOVERSOURCE_VANILLA_PATCHED__ = true;
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      const el = originalCreateElement.call(this, tagName, options);
      const source = captureSourceLocation();
      if (source && el.dataset) {
        el.dataset.hsSource = source;
      }
      return el;
    };
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
  function isOverlayFrame(line) {
    return line.includes("hoversource-overlay.js") || line.includes("overlay.bundle.js") || line.includes("captureSourceLocation") || line.includes("setupVanillaMonkeyPatch") || line.includes("createElement") || line.includes("innerHTML");
  }
  function parseStackLine(line) {
    const match = /([^\s(]+):(\d+):(\d+)/.exec(line);
    if (!match)
      return null;
    const urlStr = match[1];
    const ln = match[2];
    const col = match[3];
    try {
      let filePath = "";
      if (urlStr.startsWith("file://")) {
        filePath = urlStr.replace(/^file:\/\/\/?/, "");
        if (!/^[a-zA-Z]:/.test(filePath) && !filePath.startsWith("/")) {
          filePath = "/" + filePath;
        }
      } else if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
        const url = new URL(urlStr);
        filePath = url.pathname;
      } else {
        filePath = urlStr;
      }
      return `${filePath}:${ln}:${col}`;
    } catch {
      return null;
    }
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
      if (isOverlayFrame(line))
        continue;
      const parsed = parseStackLine(line);
      if (parsed)
        return parsed;
    }
    return null;
  }

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

  // ../source-resolver/dist/adapters/ReactFiberAdapter.js
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
      let owner = fiber._debugOwner;
      while (owner) {
        if (owner.type && typeof owner.type === "function") {
          return owner.type.name || owner.type.displayName;
        } else if (owner.type && typeof owner.type === "string") {
          owner = owner._debugOwner;
        } else if (owner.type && typeof owner.type === "object" && owner.type.render) {
          return owner.type.render.name || owner.type.displayName;
        } else {
          owner = owner._debugOwner;
        }
      }
      return void 0;
    }
    resolve(element) {
      let fiber = this.getFiber(element);
      while (fiber) {
        const source = fiber._debugSource;
        if (source) {
          const componentName = this.findComponentNameFromFiber(fiber);
          return {
            fileName: source.fileName,
            lineNumber: source.lineNumber,
            columnNumber: source.columnNumber,
            componentName: componentName || (typeof fiber.type === "function" ? fiber.type.name : void 0),
            framework: "React",
            ...getElementMetadata(element)
          };
        }
        fiber = fiber.return;
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
              const el = node;
              const loc = el.dataset.hoversourceLoc;
              if (loc) {
                invasiveLocs.set(el, loc);
              }
              try {
                el.querySelectorAll("[data-hoversource-loc]").forEach((child) => {
                  if (child instanceof HTMLElement) {
                    invasiveLocs.set(child, child.dataset.hoversourceLoc);
                  }
                });
              } catch {
              }
            }
          });
        } else if (m.type === "attributes" && m.attributeName === "data-hoversource-loc") {
          const el = m.target;
          const loc = el.dataset.hoversourceLoc;
          if (loc) {
            invasiveLocs.set(el, loc);
          }
        }
      }
    });
    const scan = () => {
      try {
        document.querySelectorAll("[data-hoversource-loc]").forEach((el) => {
          if (el instanceof HTMLElement) {
            invasiveLocs.set(el, el.dataset.hoversourceLoc);
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
  var VanillaAdapter = class {
    name = "vanilla";
    canResolve(element) {
      return typeof element.closest === "function" && !!element.closest("[data-hs-source]");
    }
    resolve(element) {
      const target = element.closest("[data-hs-source]");
      if (!target)
        return null;
      const sourceAttr = target.dataset.hsSource;
      const parsed = parseColonLocation(sourceAttr);
      if (!parsed)
        return null;
      return {
        fileName: parsed.fileName,
        lineNumber: parsed.lineNumber,
        columnNumber: parsed.columnNumber,
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
    buildSelector(el) {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const classes = Array.from(el.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
      return `${tag}${id}${classes ? "." + classes : ""}`;
    }
  };

  // src/inspector.ts
  var contextCache = /* @__PURE__ */ new WeakMap();
  var parentStyleCache = /* @__PURE__ */ new WeakMap();
  function clearInspectorCache() {
    contextCache = /* @__PURE__ */ new WeakMap();
    parentStyleCache = /* @__PURE__ */ new WeakMap();
  }
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
    const observer = new MutationObserver(() => {
      clearInspectorCache();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
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
    } catch (e) {
      console.warn("[HoverSource] Failed to compute element layout constraints", e);
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

  // src/modes/InspectorAdapter.ts
  function getCompanionPort() {
    return globalThis.__HOVERSOURCE_PORT__ ?? 7300;
  }
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
    // --- Layer Picker state ---
    layerStack = [];
    activeLayerIndex = 0;
    layerPickerEnabled = true;
    layerScrollModifiers = { altKey: true, shiftKey: true, ctrlKey: false };
    activate(controller) {
      this.controller = controller;
      const config = this.controller.getConfig();
      this.minimalMode = !!config?.minimalModeByDefault;
      this.layerPickerEnabled = config?.layerPickerEnabled !== false;
      this.layerScrollModifiers = config?.layerPickerScroll ?? { altKey: true, shiftKey: true, ctrlKey: false };
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
    onPointerOver(event, target) {
      const rawStack = document.elementsFromPoint(event.clientX, event.clientY);
      const container = this.controller.container;
      this.layerStack = rawStack.filter((el) => {
        if (el === document.documentElement || el === document.body)
          return false;
        if (container && (el === container || container.contains(el)))
          return false;
        return true;
      }).slice(0, this.maxTraversalDepth);
      this.activeLayerIndex = 0;
      this.resolveAndShowLayer(this.activeLayerIndex, event);
    }
    onPointerMove(event) {
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
      this.minimalMode = !!newConfig.minimalModeByDefault;
      this.maxTraversalDepth = newConfig.maxTraversalDepth ?? 32;
      const newEnabled = newConfig.layerPickerEnabled !== false;
      if (newEnabled !== this.layerPickerEnabled) {
        this.layerPickerEnabled = newEnabled;
        if (newEnabled) {
          window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
        } else {
          window.removeEventListener("wheel", this.handleAltScroll, { capture: true });
        }
      }
      this.layerScrollModifiers = newConfig.layerPickerScroll ?? this.layerScrollModifiers;
      this.renderTooltip({ clientX: 0, clientY: 0 });
    }
    onUIVisibilityChanged(visible) {
    }
    handleAltScroll = (e) => {
      const m = this.layerScrollModifiers;
      if (!!e.altKey !== !!m.altKey || !!e.shiftKey !== !!m.shiftKey || !!e.ctrlKey !== !!m.ctrlKey)
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
        framework: "Unknown",
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
      }
    }
    fetchBackgroundValidation(info, target, e) {
      const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
      fetch(validateUrl).then((res) => res.json()).then((data) => {
        if (this.currentElement === target) {
          let line = info.lineNumber || 1;
          let col = info.columnNumber || 1;
          if (data?.corrected) {
            line = data.corrected.line;
            col = data.corrected.column;
          }
          info.lineNumber = line;
          info.columnNumber = col;
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
          const staticContextUrl = `http://127.0.0.1:${getCompanionPort()}/static-context?file=${encodeURIComponent(info.fileName)}&line=${line}&column=${col}&tagName=${encodeURIComponent(info.componentName || info.tagName || "")}&classList=${encodeURIComponent(classListParam)}`;
          fetch(staticContextUrl).then((res) => res.json()).then((staticData) => {
            if (staticData && this.currentElement === target) {
              info.staticMetadata = staticData;
              this.currentSourceInfo = info;
              if (this.controller.isUIVisible()) {
                this.renderTooltip(e);
              }
            }
          }).catch((err) => console.warn("[HoverSource] Static context fetch failed:", err));
        }
      }).catch((err) => console.warn("[HoverSource] Background line validation failed:", err));
    }
    getShortcutLabel(shortcut) {
      if (!shortcut)
        return "";
      const parts = [];
      if (shortcut.ctrlKey)
        parts.push("Ctrl");
      if (shortcut.altKey)
        parts.push("Alt");
      if (shortcut.shiftKey)
        parts.push("Shift");
      parts.push(shortcut.key.toUpperCase());
      return parts.join("+");
    }
    renderMinimalTooltip(element, info, labels) {
      const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel } = labels;
      const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
      let vueHint = "";
      if (info.framework === "Vue" && !info.lineNumber) {
        vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
      }
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
          ${info.fileName.split("/").pop().split("\\").pop()}${info.lineNumber ? `:${info.lineNumber}` : ""}
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
      let selectorHtml = `<span class="hoversource-value">${elementSelector}</span>`;
      if (info.staticMetadata?.classOrigins) {
        const originParts = [];
        for (const cls of classList) {
          const origin = info.staticMetadata.classOrigins[cls];
          if (origin) {
            const fileBase = origin.file.split("/").pop().split("\\").pop();
            originParts.push(`<span style="color: #6b7280; font-size: 9px;">[${fileBase}:${origin.line}]</span>`);
          }
        }
        if (originParts.length > 0) {
          selectorHtml += ` \u2794 ${originParts.join(" ")}`;
        }
      }
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Element: </span>
        ${selectorHtml}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
          ${info.fileName.split("/").pop().split("\\").pop()}${info.lineNumber ? `:${info.lineNumber}` : ""}
        </span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Path: </span>
        <span class="hoversource-value">${info.fileName}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Size: </span>
        <span class="hoversource-value">${width}px \xD7 ${height}px</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Color: </span>
        <span class="hoversource-value">${color}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Background: </span>
        <span class="hoversource-value">${bgColor}</span>
      </div>
    `;
    }
    renderVisualDetails(shadow, animation, info) {
      let html = "";
      if (shadow && shadow !== "none") {
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Shadow: </span>
          <span class="hoversource-value">${shadow}</span>
        </div>
      `;
      }
      if (animation) {
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Animation: </span>
          <span class="hoversource-value">${animation}</span>
        </div>
      `;
      }
      if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
        const constraints = Object.entries(info.visualContext.layoutConstraints).map(([prop, val]) => `${prop}: ${val}`).join(", ");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Layout: </span>
          <span class="hoversource-value">${constraints}</span>
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
              originLabel = ` <span style="color: #6b7280; font-size: 9px;">[${fileBase}:${origin.line}]</span>`;
              break;
            }
          }
        }
        const isVisual = fx.property === "mask-image" || fx.property === "clip-path" || fx.property.startsWith("overflow");
        const cursorStyle = isVisual ? "cursor: pointer;" : "cursor: default;";
        const hoverClass = isVisual ? " hoversource-parent-item" : "";
        return `<div class="hoversource-stack-item${hoverClass}" data-index="${idx}" style="${cursorStyle}">${fx.tagName}${classStr}${originLabel} \u2794 ${fx.property}: ${fx.value}</div>`;
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
        const commentsHtml = info.staticMetadata.comments.map((c) => `<div class="hoversource-stack-item" style="color: #6b7280; font-style: italic;">${c}</div>`).join("");
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
        const attrs = Object.entries(info.staticMetadata.rawAttributes).map(([k, v]) => `${k}="${v}"`).join(" ");
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
      const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel } = labels;
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
      const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Minimal | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
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
          ${stack.map((item) => `<div class="hoversource-stack-item">${item}</div>`).join("")}
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
      const copyLabel = this.getShortcutLabel(shortcuts?.copyMetadata) || "[C]";
      const copyAllLabel = this.getShortcutLabel(shortcuts?.copyAllLayers || { key: "c", altKey: true, ctrlKey: false, shiftKey: true }) || "[Alt+Shift+C]";
      const minimalLabel = this.getShortcutLabel(shortcuts?.toggleMinimal) || "[M]";
      const freezeLabel = this.getShortcutLabel(shortcuts?.toggleFreeze) || "[F]";
      const dbLabel = this.getShortcutLabel(shortcuts?.openDashboard) || "[Alt+D]";
      const modeLabel = this.getShortcutLabel(shortcuts?.toggleMode) || "[Alt+X]";
      const topLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2z" /></svg>`;
      const chevronLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M112.1 154.4L276.4 230.3C304.1 243.1 336 243.1 363.7 230.3L528 154.4L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L112.1 154.4z" /></svg>`;
      const layerDots = this.layerStack.map((el, i) => {
        const isActive = i === this.activeLayerIndex;
        const tag = el.tagName.toLowerCase();
        const cls = Array.from(el.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-")).slice(0, 2).join(".");
        const label = cls ? `${tag}.${cls}` : tag;
        const zIndex = this.layerStack.length - i;
        const svgContent = i === 0 ? topLayerSvg : chevronLayerSvg;
        return `<div class="hs-layer-dot${isActive ? " hs-layer-dot--active" : ""}" style="z-index: ${zIndex}" title="Layer ${i + 1}: ${label}">${svgContent}</div>`;
      }).join("");
      const scrollHint = (() => {
        const m = this.layerScrollModifiers;
        const parts = [];
        if (m.ctrlKey)
          parts.push("Ctrl");
        if (m.altKey)
          parts.push("Alt");
        if (m.shiftKey)
          parts.push("Shift");
        parts.push("Scroll");
        return parts.join("+");
      })();
      const layerHint = this.layerStack.length > 1 ? `<div class="hs-layer-hint">${scrollHint}</div>` : "";
      const layerColumnHtml = `<div class="hs-layer-column">${layerDots}${layerHint}</div>`;
      const labels = { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel };
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
                parentItems.forEach((el) => el.classList.remove("hs-parent-active"));
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
      let text = `* **Component**: \`${data.component}\`
* **Element**: ${selectorLabel}
* **File Path**: \`${data.file || "Unknown"}\`${data.line ? ` (Line: ${data.line}, Column: ${data.column})` : ""}
* **Framework**: ${data.framework}
* **Dimensions**: ${data.dimensions}
* **Key Styles**:
  - Color: \`${data.styles.color}\`
  - Background: \`${data.styles.backgroundColor}\`
  - Box Shadow: \`${data.styles.boxShadow}\`
  - Margin: \`${data.styles.margin}\` | Padding: \`${data.styles.padding}\`
  - Display: \`${data.styles.display}\` ${directionStr}`;
      if (info.visualContext && info.visualContext.parentEffects.length > 0) {
        const parentList = this.formatParentStyles(info.visualContext.parentEffects, info.staticMetadata?.classOrigins);
        text += `
* **Parent Styles**:
${parentList}`;
      }
      if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
        const layoutList = this.formatLayoutConstraints(info.visualContext.layoutConstraints);
        text += `
* **Layout Constraints**:
${layoutList}`;
      }
      if (info.staticMetadata) {
        if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
          const commentList = this.formatSourceComments(info.staticMetadata.comments);
          text += `
* **Source Comments**:
${commentList}`;
        }
        if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
          const attrList = this.formatSourceAttributes(info.staticMetadata.rawAttributes);
          text += `
* **Source Attributes**:
${attrList}`;
        }
      }
      return text;
    }
    copyMetadata() {
      if (!this.currentSourceInfo || !this.currentElement)
        return;
      const text = `### HoverSource Component Metadata
` + this.formatElementMetadata(this.currentElement, this.currentSourceInfo);
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
    getMinifiedHTML(el) {
      const clone = el.cloneNode(true);
      const hsEls = clone.querySelectorAll('.hoversource-container, [class^="hs-"]');
      hsEls.forEach((e) => e.remove());
      return this.formatMinifiedHtmlNode(clone, "");
    }
    getTargetHTMLToCopy(el) {
      const parent = el.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        const parentInfo = this.resolver.resolve(parent);
        const isParentCustomComponent = !!parentInfo?.componentName && parentInfo.framework !== "Unknown";
        if (!isParentCustomComponent && parent.children.length <= 5) {
          const leafTags = ["input", "button", "img", "svg", "span", "i", "a", "label"];
          if (leafTags.includes(el.tagName.toLowerCase()) || el.children.length === 0) {
            return parent;
          }
        }
      }
      return el;
    }
    copyAllLayers() {
      if (this.layerStack.length === 0)
        return;
      let text = `### HoverSource Component Metadata
`;
      text += `Found ${this.layerStack.length} layer(s), ordered from leaf (Layer 1) to root:

`;
      this.layerStack.forEach((el, index) => {
        let info;
        if (el === this.currentElement && this.currentSourceInfo) {
          info = this.currentSourceInfo;
        } else {
          info = this.resolver.resolve(el) || {
            componentName: el.tagName.toLowerCase(),
            tagName: el.tagName.toLowerCase(),
            framework: "Unknown",
            fileName: "",
            lineNumber: 0,
            columnNumber: 0,
            classList: Array.from(el.classList),
            visualContext: null,
            staticMetadata: null
          };
          info.visualContext = inspectVisualContext(el);
        }
        const layerNum = index + 1;
        const totalLayers = this.layerStack.length;
        text += `#### Layer ${layerNum}/${totalLayers}: \`${info.componentName || el.tagName.toLowerCase()}\` (${el.tagName.toLowerCase()})
`;
        text += this.formatElementMetadata(el, info) + "\n\n";
      });
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
      const elements = document.elementsFromPoint(x, y);
      const target = elements.find((el) => {
        if (el === document.documentElement || el === document.body)
          return false;
        if (container && (el === container || container.contains(el)))
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
      const allEls = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, button, input, textarea, label, span, div, section, main, article, li, img, svg"));
      const candidates = [];
      for (const el of allEls) {
        if (el === document.documentElement || el === document.body)
          continue;
        if (container && (el === container || container.contains(el)))
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
          continue;
        const distToCenterH = Math.min(Math.abs(rect.left - mouseX), Math.abs(rect.right - mouseX), Math.abs(rect.left + rect.width / 2 - mouseX));
        const distToCenterV = Math.min(Math.abs(rect.top - mouseY), Math.abs(rect.bottom - mouseY), Math.abs(rect.top + rect.height / 2 - mouseY));
        if (distToCenterH > 450 && distToCenterV > 450)
          continue;
        candidates.push({ element: el, rect });
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
      this.svgOverlay.innerHTML = "";
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
      const drawAnchorOutline = (el, color) => {
        const rect = el.getBoundingClientRect();
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
      return `<span style="color: #10b981; font-weight:bold;">${selector} @ ${boundary || "None"} (${sign}${offset}px)</span>`;
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
        <span class="hoversource-value">${tagLower}${idStr}${classStr}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor File: </span>
        <span class="hoversource-value" style="color: #60a5fa;">${fileBase}${info.lineNumber ? `:${info.lineNumber}` : ""}</span>
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
      const copyLabel = shortcuts?.copyMetadata?.key ? `Alt+${shortcuts.copyMetadata.key.toUpperCase()}` : "Alt+C";
      const freezeLabel = shortcuts?.toggleFreeze?.key ? `Alt+${shortcuts.toggleFreeze.key.toUpperCase()}` : "Alt+P";
      const modeLabel = shortcuts?.toggleMode?.key ? `Alt+${shortcuts.toggleMode.key.toUpperCase()}` : "Alt+X";
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const offsetH = this.getHorizontalOffset(dotViewportX);
      const offsetV = this.getVerticalOffset(dotViewportY);
      const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
      const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
      const hStatus = this.formatAnchorStatus(this.anchorHElement, selectorH, this.snapBoundaryH, offsetH);
      const vStatus = this.formatAnchorStatus(this.anchorVElement, selectorV, this.snapBoundaryV, offsetV);
      const fileBase = info.fileName ? info.fileName.split("/").pop()?.split("\\").pop() || "unknown" : "unknown";
      const hintText = `Drag the Crosshair to position | Press ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze & Nudge"} | ${copyLabel} to Copy Design Metadata | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
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
      return `
### HoverSource Design Placement Metadata
* **Component**: \`${p.component}\`
* **Element**: \`${p.selector}\`
* **File Path**: \`${p.filePath}\`${p.line ? ` (Line: ${p.line}, Column: ${p.column})` : ""}
* **Framework**: ${p.framework}
* **Horizontal Anchor**:
  - Selector: \`${p.selectorH}\`
  - Boundary: \`${p.boundaryH}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signH}${p.offsetH}px\` (${p.isSnappedHText})
* **Vertical Anchor**:
  - Selector: \`${p.selectorV}\`
  - Boundary: \`${p.boundaryV}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signV}${p.offsetV}px\` (${p.isSnappedVText})

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${p.posAncLine}
* **Anchor Element**: \`${p.anchorForContextSelector}\` (display: ${p.anchorElementDisplay})
${p.anchorNoteStr}* **Direct Parent of Anchor**: ${p.directParentLine}
${p.warningStr}* **USE THIS CSS** (do not use the distance values above as CSS \u2014 use this block):
\`\`\`css
${p.cssRules}
\`\`\`
* **Source Files to Examine**:
${p.filesSection}

#### For the AI Agent
The CSS above assumes the new element will be a direct child of the Positioned Ancestor.
You must determine the actual DOM insertion point by examining the source files above.
The following is NOT resolved automatically and requires your judgment:
- **DOM insertion point**: where in the JSX/template tree the new element belongs
  (sibling of anchor, child of a wrapper, inside a portal, etc.)
- **Whether \`position: absolute\` is appropriate**: if the anchor or its parent is a flex/grid
  container, a flex/grid child approach may be more appropriate
- **Whether the Positioned Ancestor has \`position: relative\` in source**: verify
  it is not conditionally applied

Suggested layout insertion (heuristic only):
* Target DOM Parent: \`${p.targetParentSelector}\` (${p.targetParentType})
`.trim();
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
      this.maxTraversalDepth = newConfig.maxTraversalDepth ?? 32;
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
  function getSelector(el) {
    if (!el)
      return "";
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
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
  function getCompanionBaseUrl() {
    const isProxy = globalThis.__HOVERSOURCE_PROXY__ === true;
    if (isProxy) {
      return "/hoversource";
    }
    const port = globalThis.__HOVERSOURCE_PORT__ ?? 7300;
    return `http://127.0.0.1:${port}`;
  }
  var OverlayEngine = class _OverlayEngine {
    config = null;
    container = null;
    outlineBox = null;
    tooltipBox = null;
    parentHighlightElements = [];
    uiVisible = true;
    isFrozen = false;
    freezeStyle = null;
    inspectorMode = new InspectorAdapter();
    designMode = new DesignAdapter();
    activeMode = this.inspectorMode;
    constructor() {
    }
    static async launch() {
      const engine = new _OverlayEngine();
      await engine.init();
      return engine;
    }
    async init() {
      await this.loadConfig();
      this.createUI();
      this.initStyles();
      this.initShortcuts();
      this.activeMode.activate(this);
      globalThis.addEventListener("pointerover", this.handlePointerOver, { capture: true });
      globalThis.addEventListener("pointermove", this.handlePointerMove, { capture: true });
      globalThis.addEventListener("message", (e) => {
        if (e.origin === globalThis.location.origin && e.source === globalThis && e.data?.type === "HOVERSOURCE_CONFIG_CHANGED") {
          this.handleConfigUpdate(e.data.config);
        }
      });
    }
    handleConfigUpdate(newConfig) {
      console.log("[HoverSource] Live reloading config...", newConfig);
      this.config = newConfig;
      const oldStyle = document.getElementById("hoversource-styles");
      if (oldStyle)
        oldStyle.remove();
      this.initStyles();
      this.activeMode.onConfigUpdate(newConfig);
    }
    async loadConfig() {
      try {
        const res = await fetch(`${getCompanionBaseUrl()}/config`);
        const data = await res.json();
        this.config = data.config;
        console.log("[HoverSource] Configuration loaded from companion server:", this.config);
      } catch (e) {
        console.warn("[HoverSource] Failed to fetch config, falling back to defaults", e);
        this.config = {
          theme: "dark",
          minimalModeByDefault: false,
          snappingThreshold: 15,
          desnappingThreshold: 15,
          maxTraversalDepth: 32,
          shortcuts: {
            toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false },
            toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false },
            toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false },
            copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false },
            openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false },
            toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false }
          }
        };
      }
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
        layerHintColor: "#9ca3af"
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
        layerHintColor: "#6b7280"
      };
      const style = document.createElement("style");
      style.id = "hoversource-styles";
      style.innerHTML = `
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
    `;
      if (this.container) {
        this.container.appendChild(style);
      } else {
        document.head.appendChild(style);
      }
    }
    createUI() {
      if (this.container)
        return;
      this.container = document.createElement("div");
      this.container.className = "hoversource-container";
      this.outlineBox = document.createElement("div");
      this.outlineBox.className = "hoversource-outline";
      this.outlineBox.style.display = "none";
      this.container.appendChild(this.outlineBox);
      this.tooltipBox = document.createElement("div");
      this.tooltipBox.className = "hoversource-tooltip";
      this.tooltipBox.style.display = "none";
      this.container.appendChild(this.tooltipBox);
      document.body.appendChild(this.container);
    }
    ensureUI() {
      if (this.container && !document.body.contains(this.container)) {
        console.log("[HoverSource] Self-healing: Restored overlay container to DOM.");
        document.body.appendChild(this.container);
      }
    }
    initShortcuts() {
      globalThis.addEventListener("keydown", this.handleKeyDown);
    }
    handleModeShortcuts(e, shortcuts) {
      const toggleModeShortcut = shortcuts.toggleMode ?? { key: "x", altKey: true, ctrlKey: false, shiftKey: false };
      if (this.matchShortcut(e, shortcuts.openDashboard)) {
        e.preventDefault();
        console.log("[HoverSource] Shortcut matched: openDashboard");
        this.openDashboardInBrowser();
      } else if (this.matchShortcut(e, toggleModeShortcut)) {
        e.preventDefault();
        this.switchMode();
      } else if (this.matchShortcut(e, shortcuts.toggleMinimal)) {
        e.preventDefault();
        this.activeMode.onShortcut("toggleMinimal");
      } else if (this.matchShortcut(e, shortcuts.toggleFreeze)) {
        e.preventDefault();
        this.activeMode.onShortcut("toggleFreeze");
      } else if (this.matchShortcut(e, shortcuts.copyMetadata)) {
        e.preventDefault();
        this.activeMode.onShortcut("copyMetadata");
      } else if (this.matchShortcut(e, shortcuts.copyAllLayers ?? { key: "c", altKey: true, ctrlKey: false, shiftKey: true })) {
        e.preventDefault();
        this.activeMode.onShortcut("copyAllLayers");
      }
    }
    handleKeyDown = (e) => {
      const shortcuts = this.config?.shortcuts;
      if (!shortcuts)
        return;
      if (this.matchShortcut(e, shortcuts.toggleUI)) {
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
    switchMode() {
      this.activeMode.deactivate();
      this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
      this.activeMode.activate(this);
    }
    openDashboardInBrowser() {
      fetch(`${getCompanionBaseUrl()}/open-dashboard`).then((r) => r.json()).then((data) => {
        if (data.success) {
          console.log("[HoverSource] Triggered dashboard browser open.");
        } else {
          console.error("[HoverSource] Failed to open dashboard:", data.error);
        }
      }).catch((e) => {
        console.error("[HoverSource] Failed to request dashboard open:", e);
      });
    }
    matchShortcut(e, shortcut) {
      if (!shortcut?.key)
        return false;
      if (!!e.altKey !== !!shortcut.altKey || !!e.ctrlKey !== !!shortcut.ctrlKey || !!e.shiftKey !== !!shortcut.shiftKey)
        return false;
      const targetKey = shortcut.key.toLowerCase();
      const keyMatch = e.key.toLowerCase() === targetKey;
      const codeMatch = e.code && (e.code.toLowerCase() === targetKey || e.code.toLowerCase() === `key${targetKey}` || e.code.toLowerCase() === `digit${targetKey}`);
      return keyMatch || !!codeMatch;
    }
    isTyping(e) {
      const activeEl = document.activeElement;
      if (!activeEl)
        return false;
      const tag = activeEl.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
    }
    handlePointerOver = (e) => {
      this.ensureUI();
      const target = e.target;
      if (!target || target === this.container || this.container?.contains(target)) {
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
    blockEvent = (e) => {
      if (this.container?.contains(e.target))
        return;
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
        this.tooltipBox.innerHTML = html;
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
      for (const el of this.parentHighlightElements) {
        el.remove();
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
      console.log("[HoverSource] Copied component metadata to clipboard!");
      if (this.uiVisible && this.tooltipBox) {
        const hint = this.tooltipBox.querySelector(".hoversource-shortcut-hint");
        if (hint) {
          const originalText = hint.innerHTML;
          hint.innerHTML = "<span style='color: #10b981; font-weight: bold;'>Copied successfully for AI!</span>";
          setTimeout(() => {
            hint.innerHTML = originalText;
          }, 1500);
        }
      }
    }
    getConfig() {
      return this.config;
    }
    isUIVisible() {
      return this.uiVisible;
    }
    setFreezeMode(frozen) {
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
        this.freezeStyle.innerHTML = `
        * { pointer-events: auto !important; }
        .hoversource-container { pointer-events: none !important; }
        .hoversource-outline { pointer-events: none !important; }
        .hoversource-tooltip, .hoversource-tooltip * { pointer-events: auto !important; }
      `;
        document.head.appendChild(this.freezeStyle);
      } else {
        events.forEach((event) => globalThis.removeEventListener(event, this.blockEvent, { capture: true }));
        if (this.freezeStyle) {
          this.freezeStyle.remove();
          this.freezeStyle = null;
        }
      }
    }
  };
  globalThis.__HoverSourceOpen__ = (file, line, col, tagName, classList) => {
    let url = `${getCompanionBaseUrl()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
    if (tagName)
      url += `&tagName=${encodeURIComponent(tagName)}`;
    if (classList)
      url += `&classList=${encodeURIComponent(classList)}`;
    fetch(url).then((r) => r.json()).then((data) => {
      if (data.success) {
        console.log(`[HoverSource] Opened file in editor: ${file}`);
      } else {
        console.error("[HoverSource] Editor open failed:", data.error);
      }
    }).catch((e) => console.error("[HoverSource] Failed to reach companion server:", e));
  };
  if (typeof document !== "undefined" && !globalThis.__HoverSourceInitialized__) {
    globalThis.__HoverSourceInitialized__ = true;
    OverlayEngine.launch();
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
