// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSafeFragmentFromHtml,
  setElementContentSafely,
  el,
  escapeHtml,
} from "../safeDom.js";
import { OverlayEngine } from "../overlay.js";
import { InspectorAdapter } from "../modes/InspectorAdapter.js";
import { DesignAdapter } from "../modes/DesignAdapter.js";

vi.hoisted(() => {
  (globalThis as any).__HoverSourceInitialized__ = true;
});

function installInnerHtmlSpies() {
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const elDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (elDesc?.set) {
    spies.push(vi.spyOn(Element.prototype, "innerHTML", "set"));
  }
  if (typeof ShadowRoot !== "undefined") {
    const srDesc = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "innerHTML");
    if (srDesc?.set) {
      spies.push(vi.spyOn(ShadowRoot.prototype, "innerHTML", "set"));
    }
  }
  return spies;
}

describe("safeDom HTML/SVG sanitization and zero-innerHTML invariants", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 }))
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  it("renders complex tooltip HTML and multi-path SVG without invoking innerHTML setters", () => {
    const spies = installInnerHtmlSpies();
    const container = document.createElement("div");

    const html = `
      <div class="hoversource-header">
        <span class="hoversource-badge">React</span>
        <span class="hoversource-link" data-hs-open-file="src/App.tsx" data-hs-open-line="12">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M1 1 L15 15" stroke="currentColor" />
            <path d="M15 1 L1 15" stroke="currentColor" />
          </svg>
          App.tsx:12
        </span>
      </div>
      <div class="hoversource-row">
        <span class="hoversource-label">Component</span>
        <code class="hoversource-code">Button</code>
      </div>
    `;

    setElementContentSafely(container, html);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].namespaceURI).toBe("http://www.w3.org/2000/svg");

    const link = container.querySelector(".hoversource-link") as HTMLElement | null;
    expect(link?.getAttribute("data-hs-open-file")).toBe("src/App.tsx");
    expect(link?.getAttribute("data-hs-open-line")).toBe("12");
    expect(container.querySelector(".hoversource-code")?.textContent).toBe("Button");
  });

  it("auto-closes void elements case-insensitively without /> and preserves valueless boolean attributes", () => {
    const frag1 = createSafeFragmentFromHtml(
      '<input type="checkbox" data-type="component" checked data-field="componentName"><span>after</span>'
    );
    const wrap1 = document.createElement("div");
    wrap1.appendChild(frag1);

    const input1 = wrap1.querySelector("input");
    const span1 = wrap1.querySelector("span");
    expect(input1).not.toBeNull();
    expect(span1).not.toBeNull();
    expect(input1?.getAttribute("checked")).toBe("");
    expect(input1?.getAttribute("data-field")).toBe("componentName");
    expect(span1?.parentElement).toBe(wrap1);
    expect(input1?.contains(span1!)).toBe(false);

    const frag2 = createSafeFragmentFromHtml(
      '<INPUT type="checkbox" checked><SPAN>after</SPAN><BR><SPAN>next</SPAN>'
    );
    const wrap2 = document.createElement("div");
    wrap2.appendChild(frag2);

    const input2 = wrap2.querySelector("input");
    const spans2 = wrap2.querySelectorAll("span");
    expect(input2?.getAttribute("checked")).toBe("");
    expect(spans2).toHaveLength(2);
    expect(spans2[0].parentElement).toBe(wrap2);
    expect(spans2[1].parentElement).toBe(wrap2);
    expect(wrap2.querySelector("br")).not.toBeNull();
  });

  it("drops unsafe tags, attributes, SMIL elements, comments, and obfuscated URLs while handling malformed markup", () => {
    const smilFrag = createSafeFragmentFromHtml(
      '<svg><animate attributeName="x" /><set attributeName="y" /><animateTransform /><animateMotion /></svg>'
    );
    const smilWrap = document.createElement("div");
    smilWrap.appendChild(smilFrag);
    expect(smilWrap.querySelector("svg")).not.toBeNull();
    expect(smilWrap.querySelector("animate")).toBeNull();
    expect(smilWrap.querySelector("set")).toBeNull();
    expect(smilWrap.querySelector("animatetransform, animateTransform")).toBeNull();
    expect(smilWrap.querySelector("animatemotion, animateMotion")).toBeNull();

    const unsafeFrag = createSafeFragmentFromHtml(
      [
        "<!-- secret comment -->",
        '<img src="ok.png" onerror>',
        '<div onclick="alert(1)" ONMOUSEOVER="alert(2)" srcdoc="<b>x</b>">',
        '<span title="a > b">ok</span>',
        '<embed src="x.swf"><base href="https://evil.invalid/">',
        '<iframe src="https://evil.invalid/">bad</iframe>',
        '<object data="x"></object>',
        "<foreignObject><div>bad</div></foreignObject>",
        "<style>body{color:red}</style>",
        "<script>alert(1)</script>",
        "<SCRIPT>alert(2)</SCRIPT>",
        '<a href="JaVaScRiPt:alert(1)">js</a>',
        '<a href="vbscript:msgbox(1)">vb</a>',
        '<img src="DATA:text/html,<script>alert(1)</script>">',
        '<img src="data:image/svg+xml,<svg/>">',
        '<a href="data:application/xhtml+xml,<html/>">xhtml</a>',
        '<form action="data:text/xml,<x/>" formaction="&#106;avascript:alert(1)">',
        '<a href="&#x6a;avascript:alert(1)">hex1</a>',
        '<a href="&#X6A;avascript:alert(1)">hex2</a>',
        "</div>",
      ].join("")
    );
    const unsafeWrap = document.createElement("div");
    unsafeWrap.appendChild(unsafeFrag);

    expect(unsafeWrap.textContent).not.toContain("secret comment");
    expect(unsafeWrap.textContent).not.toContain("body{color:red}");
    expect(unsafeWrap.textContent).not.toContain("alert(1)");
    expect(unsafeWrap.textContent).not.toContain("alert(2)");
    expect(unsafeWrap.querySelector("script, iframe, object, embed, foreignObject, style, base")).toBeNull();

    const img = unsafeWrap.querySelector("img");
    expect(img?.getAttribute("onerror")).toBeNull();
    const div = unsafeWrap.querySelector("div");
    expect(div?.getAttribute("onclick")).toBeNull();
    expect(div?.getAttribute("onmouseover")).toBeNull();
    expect(div?.getAttribute("srcdoc")).toBeNull();

    const span = unsafeWrap.querySelector("span");
    expect(span?.getAttribute("title")).toBe("a > b");
    expect(span?.textContent).toBe("ok");

    for (const a of Array.from(unsafeWrap.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toBeNull();
    }
    for (const i of Array.from(unsafeWrap.querySelectorAll("img"))) {
      expect(i.getAttribute("src") ?? "").not.toMatch(/data:/i);
    }
    const form = unsafeWrap.querySelector("form");
    expect(form?.getAttribute("action")).toBeNull();
    expect(form?.getAttribute("formaction")).toBeNull();

    // Unclosed <script> / <style>
    const unclosedScript = createSafeFragmentFromHtml("<script>alert(1)");
    expect(unclosedScript.textContent).toBe("");
    const unclosedStyle = createSafeFragmentFromHtml("<style>body{color:red}");
    expect(unclosedStyle.textContent).toBe("");

    // Malformed < / invalid tag names should not throw InvalidCharacterError
    expect(() => createSafeFragmentFromHtml("1 < 2 and <123> and <bad!tag>ok")).not.toThrow();

    // NUL and out-of-range code points should not throw RangeError
    expect(() => createSafeFragmentFromHtml("&#0;&#x00;&#99999999;")).not.toThrow();

    // Literal entity rendering & no double-unescaping
    const literalFrag = createSafeFragmentFromHtml("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(literalFrag.textContent).toBe("<script>alert(1)</script>");
    expect(literalFrag.querySelector("script")).toBeNull();

    const noDoubleDecode = createSafeFragmentFromHtml("&amp;lt;&amp;#60;");
    expect(noDoubleDecode.textContent).toBe("&lt;&#60;");
  });

  it("enforces identical tag and attribute sanitization in el()", () => {
    for (const rejected of [
      "script",
      "iframe",
      "object",
      "style",
      "base",
      "animate",
      "set",
      "animateTransform",
      "animateMotion",
    ]) {
      expect(el(rejected, { id: "x" }, ["bad"])).toBeNull();
    }

    const link = el(
      "a",
      {
        href: "vbscript:msgbox(1)",
        onclick: "alert(1)",
        srcdoc: "<b>x</b>",
        class: "safe-link",
      },
      ["Click"]
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBeNull();
    expect(link?.getAttribute("onclick")).toBeNull();
    expect(link?.getAttribute("srcdoc")).toBeNull();
    expect(link?.getAttribute("class")).toBe("safe-link");

    const img = el("img", { src: "data:image/svg+xml,<svg/>", alt: "pic" });
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBeNull();
    expect(img?.getAttribute("alt")).toBe("pic");

    expect(escapeHtml(`<a href="'&'">`)).toBe("&lt;a href=&quot;&#39;&amp;&#39;&quot;&gt;");
  });
});

describe("OverlayEngine Shadow DOM isolation & Trusted Types compliance", () => {
  let activeDesignAdapter: DesignAdapter | null = null;
  let activeEngine: OverlayEngine | null = null;
  let fetchMock: ReturnType<typeof vi.fn>;
  let clipboardWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/config")) {
        return new Response(
          JSON.stringify({
            config: {
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
                toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes("/static-context")) {
        return new Response(
          JSON.stringify({
            comments: ["<script>alert(1)</script>"],
            rawAttributes: { 'data-x"onclick="alert(1)': '<script>alert("x")</script>' },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    clipboardWriteMock = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteMock },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      writable: true,
      value: vi.fn(() => []),
    });
  });

  afterEach(async () => {
    await OverlayEngine.destroyActive();
    activeEngine?.destroy();
    activeEngine = null;
    activeDesignAdapter?.deactivate();
    activeDesignAdapter = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  it("mounts #hoversource-host with open ShadowRoot, :host reset, and theme tokens without innerHTML", async () => {
    const spies = installInnerHtmlSpies();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();

    const host = document.getElementById("hoversource-host");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    expect(host?.shadowRoot?.mode).toBe("open");

    const styleEl = host?.shadowRoot?.querySelector("#hoversource-styles");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain(":host {");
    expect(styleEl?.textContent).toContain("all: initial;");
    expect(styleEl?.textContent).toContain("#3b82f6");

    // Live reload light theme
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type: "HOVERSOURCE_CONFIG_CHANGED", config: { theme: "light" } },
      })
    );
    const lightStyleEl = host?.shadowRoot?.querySelector("#hoversource-styles");
    expect(lightStyleEl?.textContent).toContain("#2563eb");

    // Live reload system theme (matchMedia matches dark = false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type: "HOVERSOURCE_CONFIG_CHANGED", config: { theme: "system" } },
      })
    );
    const systemLightStyleEl = host?.shadowRoot?.querySelector("#hoversource-styles");
    expect(systemLightStyleEl?.textContent).toContain("#2563eb");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }

    await OverlayEngine.destroyActive();
    expect(document.getElementById("hoversource-host")).toBeNull();
    expect(activeEngine!.shadowHost).toBeNull();
  });

  it("escapes adversarial tooltip inputs in InspectorAdapter (minimal & detailed) and dispatches delegated /open-in-ide clicks", async () => {
    vi.useFakeTimers();
    const spies = installInnerHtmlSpies();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();

    const host = document.getElementById("hoversource-host")!;
    const shadow = host.shadowRoot!;

    const target = document.createElement("div");
    target.setAttribute("id", '"><img src=https://example.invalid/x>');
    target.setAttribute("class", "<img src=https://example.invalid/y>");
    target.setAttribute("data-hs-source", "C:\\Users\\dev\\App.tsx:42:7");
    document.body.appendChild(target);

    const adapter = new InspectorAdapter();
    adapter.activate(activeEngine!);
    vi.spyOn((adapter as any).resolver, "resolve").mockReturnValue({
      componentName: '<script>alert(1)</script>" onclick="alert(1)',
      framework: "React",
      fileName: "C:\\Users\\dev\\App.tsx",
      lineNumber: 42,
      columnNumber: 7,
      tagName: "div",
      classList: ["<img", "src=https://example.invalid/y>"],
    });
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([target]);

    const ptrEvent = new PointerEvent("pointerover", { clientX: 10, clientY: 10, bubbles: true });
    // Detailed mode
    adapter.onPointerOver(ptrEvent, target);
    await vi.advanceTimersByTimeAsync(60);

    expect(shadow.querySelectorAll("img")).toHaveLength(0);
    expect(shadow.querySelectorAll("script")).toHaveLength(0);

    const tooltipBox = shadow.querySelector(".hoversource-tooltip") as HTMLElement;
    expect(tooltipBox.textContent).toContain('<script>alert(1)</script>" onclick="alert(1)');
    expect(tooltipBox.textContent).toContain('div.<img');

    const link = tooltipBox.querySelector(".hoversource-link") as HTMLElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("onclick")).toBeNull();
    expect(link.getAttribute("data-hs-open-file")).toBe("C:\\Users\\dev\\App.tsx");

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await Promise.resolve();

    const openCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/open-in-ide"));
    expect(openCalls.length).toBeGreaterThanOrEqual(1);
    const openUrl = String(openCalls[openCalls.length - 1][0]);
    expect(openUrl).toContain(`file=${encodeURIComponent("C:\\Users\\dev\\App.tsx")}`);
    expect(openUrl).toContain("line=42");
    expect(openUrl).toContain("column=7");
    expect(openUrl).toContain("tagName=div");

    // Minimal mode
    adapter.onShortcut("toggleMinimal");
    const minLink = tooltipBox.querySelector(".hoversource-link") as HTMLElement;
    expect(minLink.getAttribute("onclick")).toBeNull();
    expect(minLink.getAttribute("data-hs-open-file")).toBe("C:\\Users\\dev\\App.tsx");
    minLink.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await Promise.resolve();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/open-in-ide")).length).toBeGreaterThanOrEqual(2);

    // Empty data-hs-open-file is a no-op
    const countBeforeEmpty = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/open-in-ide")).length;
    minLink.setAttribute("data-hs-open-file", "");
    minLink.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/open-in-ide")).length).toBe(countBeforeEmpty);

    // Direct globalThis.__HoverSourceOpen__ compatibility
    (globalThis as any).__HoverSourceOpen__("src/Main.tsx", 5, 2, "span", "btn");
    await Promise.resolve();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/open-in-ide")).length).toBe(countBeforeEmpty + 1);

    adapter.deactivate();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("maintains idempotent freeze mode, composedPath interactivity, clone stripping, and safe clipboard hint restoration", async () => {
    vi.useFakeTimers();
    const spies = installInnerHtmlSpies();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();

    const host = document.getElementById("hoversource-host")!;
    const shadow = host.shadowRoot!;

    // Idempotent setFreezeMode(true) / (false)
    activeEngine!.setFreezeMode(true);
    activeEngine!.setFreezeMode(true);
    expect(document.head.querySelectorAll("#hoversource-freeze-styles")).toHaveLength(1);
    const shadowFreeze = shadow.querySelectorAll("#hoversource-freeze-shadow-styles");
    expect(shadowFreeze).toHaveLength(1);
    expect(shadowFreeze[0].textContent).toContain(".hoversource-tooltip");
    expect(shadowFreeze[0].textContent).toContain(".hoversource-config-panel");
    expect(shadowFreeze[0].textContent).toContain(".hoversource-parent-badge");

    // Draw tooltip and test composedPath interactivity under freeze mode
    activeEngine!.drawTooltip(
      '<div><span class="hoversource-link" data-hs-open-file="a.ts">a.ts</span><div class="hoversource-shortcut-hint"><span>Original Hint</span></div></div>',
      new PointerEvent("pointerover", { clientX: 20, clientY: 20 })
    );

    const link = shadow.querySelector(".hoversource-link")!;
    const insideClick = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true });
    link.dispatchEvent(insideClick);
    expect(insideClick.defaultPrevented).toBe(false);

    const insidePointerOver = new PointerEvent("pointerover", { bubbles: true, composed: true, cancelable: true });
    shadow.querySelector(".hoversource-config-panel")!.dispatchEvent(insidePointerOver);
    expect(insidePointerOver.defaultPrevented).toBe(false);

    const outsideEl = document.createElement("button");
    document.body.appendChild(outsideEl);
    const outsideClick = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true });
    outsideEl.dispatchEvent(outsideClick);
    expect(outsideClick.defaultPrevented).toBe(true);

    // Re-entrant copyToClipboard + drawTooltip("", ...) hint preservation
    await activeEngine!.copyToClipboard("first");
    const hint = shadow.querySelector(".hoversource-shortcut-hint")!;
    expect(hint.textContent).toContain("Copied metadata");

    activeEngine!.drawTooltip("", new PointerEvent("pointermove", { clientX: 30, clientY: 30 }));
    await activeEngine!.copyToClipboard("second");
    expect(hint.textContent).toContain("Copied metadata");

    await vi.advanceTimersByTimeAsync(1500);
    expect(hint.textContent).toBe("Original Hint");

    // Destroy during pending clipboard write prevents post-destroy mutation
    let resolvePendingWrite!: () => void;
    clipboardWriteMock.mockImplementationOnce(
      () => new Promise<void>((res) => { resolvePendingWrite = res; })
    );
    const pendingCopy = activeEngine!.copyToClipboard("pending");
    activeEngine!.destroy();
    resolvePendingWrite();
    await pendingCopy;

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("strips #hoversource-host in InspectorAdapter.getMinifiedHTML and excludes #hoversource-host in InspectorAdapter and DesignAdapter", async () => {
    vi.useFakeTimers();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();
    const host = document.getElementById("hoversource-host")!;

    // Place a button inside a host container alongside #hoversource-host for getMinifiedHTML test
    const wrapper = document.createElement("section");
    const btn = document.createElement("button");
    btn.setAttribute("data-hs-source", "App.tsx:1:1");
    btn.textContent = "Click";
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);

    // Also test getMinifiedHTML when a container directly contains #hoversource-host
    const containerWithHost = document.createElement("div");
    const innerBtn = document.createElement("button");
    innerBtn.setAttribute("data-hs-source", "App.tsx:2:1");
    innerBtn.textContent = "Inner";
    containerWithHost.appendChild(innerBtn);
    containerWithHost.appendChild(host);
    document.body.appendChild(containerWithHost);

    vi.spyOn(document, "elementsFromPoint").mockReturnValue([host, innerBtn]);
    innerBtn.dispatchEvent(new PointerEvent("pointerover", { clientX: 5, clientY: 5, bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", altKey: true }));
    await Promise.resolve();
    expect(clipboardWriteMock).toHaveBeenCalled();
    const copied = String(clipboardWriteMock.mock.calls[clipboardWriteMock.mock.calls.length - 1][0]);
    expect(copied).not.toContain("hoversource-host");

    // DesignAdapter shadowHost exclusion
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 10, top: 10, right: 110, bottom: 110, width: 100, height: 100, x: 10, y: 10, toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([host]);

    activeDesignAdapter = new DesignAdapter();
    activeDesignAdapter.activate(activeEngine!);
    const designSvg = host.shadowRoot!.querySelector("#hoversource-design-svg");
    expect(designSvg?.querySelectorAll("rect")).toHaveLength(0);

    // Non-candidate target + activate + toggleFreeze should render "No Anchor"
    activeDesignAdapter.deactivate();
    const nonCandidate = document.createElement("custom-widget");
    document.body.appendChild(nonCandidate);
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([host, nonCandidate]);
    activeDesignAdapter.activate(activeEngine!);
    activeDesignAdapter.onShortcut("toggleFreeze");
    expect(host.shadowRoot!.querySelector(".hoversource-tooltip")?.textContent).toContain("No Anchor");
  });

  it("renders filterPanel via Alt+Ctrl+D without innerHTML, preserves bubbling, and restores button focus", async () => {
    const spies = installInnerHtmlSpies();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();
    const shadow = document.getElementById("hoversource-host")!.shadowRoot!;

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", altKey: true, ctrlKey: true }));

    const panel = shadow.querySelector(".hoversource-config-panel") as HTMLElement;
    expect(panel.style.display).toBe("block");

    const checkCols = panel.querySelectorAll("td.check-col");
    expect(checkCols.length).toBeGreaterThan(0);
    for (const col of Array.from(checkCols)) {
      const cb = col.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      expect(cb).not.toBeNull();
      expect(cb?.checked).toBe(true);
    }

    const nextBtn = panel.querySelector("#hoversource-next-btn") as HTMLButtonElement;
    const prevBtn = panel.querySelector("#hoversource-prev-btn") as HTMLButtonElement;
    expect(nextBtn.getAttribute("type")).toBe("button");
    expect(nextBtn.getAttribute("aria-label")).toBe("Next metadata category");
    expect(prevBtn.getAttribute("type")).toBe("button");
    expect(prevBtn.getAttribute("aria-label")).toBe("Previous metadata category");

    let shadowSawClick = false;
    shadow.addEventListener("click", () => {
      shadowSawClick = true;
    });

    nextBtn.focus();
    expect(shadow.activeElement).toBe(nextBtn);
    nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(shadowSawClick).toBe(true);
    const newNextBtn = panel.querySelector("#hoversource-next-btn") as HTMLButtonElement;
    expect(newNextBtn).not.toBeNull();
    expect(shadow.activeElement).toBe(newNextBtn);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("routes custom/macOS toggleFilterPanel and updates Inspector & Design tooltip footers immediately on HOVERSOURCE_CONFIG_CHANGED", async () => {
    vi.useFakeTimers();
    const spies = installInnerHtmlSpies();
    vi.stubGlobal("navigator", {
      platform: "Win32",
      clipboard: { writeText: clipboardWriteMock },
    });

    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();

    const shadow = document.getElementById("hoversource-host")!.shadowRoot!;
    const target = document.createElement("button");
    target.setAttribute("data-hs-source", "App.tsx:10:2");
    target.textContent = "Save";
    document.body.appendChild(target);
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([target]);

    // Trigger hover in Inspector mode (activeEngine starts in Inspector mode)
    target.dispatchEvent(new PointerEvent("pointerover", { clientX: 15, clientY: 15, bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);

    const tooltipBox = shadow.querySelector(".hoversource-tooltip") as HTMLElement;
    expect(tooltipBox.textContent).toContain("Ctrl+Alt+D for Filters");
    expect(tooltipBox.textContent).toContain("Alt+H to Hide/Show");
    expect(tooltipBox.textContent).toContain("Alt+Shift+Scroll for Layers");

    // Push config update with custom toggleFilterPanel & metaKey toggleUI via HOVERSOURCE_CONFIG_CHANGED
    const updatedShortcuts = {
      toggleUI: { key: "u", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true },
      toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
      toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
      copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
      copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true, metaKey: false },
      openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
      toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
      toggleFilterPanel: { key: "d", altKey: true, ctrlKey: false, shiftKey: false, metaKey: true },
    };

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: {
          type: "HOVERSOURCE_CONFIG_CHANGED",
          config: {
            theme: "dark",
            minimalModeByDefault: false,
            shortcuts: updatedShortcuts,
            layerPickerScroll: { altKey: true, shiftKey: false, ctrlKey: true, metaKey: false },
          },
        },
      })
    );

    // Inspector tooltip should update immediately without re-hovering
    expect(tooltipBox.textContent).toContain("Alt+Win+D for Filters");
    expect(tooltipBox.textContent).toContain("Win+U to Hide/Show");
    expect(tooltipBox.textContent).toContain("Ctrl+Alt+Scroll for Layers");

    // Old Alt+Ctrl+D should no longer open filterPanel, whereas macOS Option+Cmd+D (e.key="∂", e.code="KeyD") should
    const panel = shadow.querySelector(".hoversource-config-panel") as HTMLElement;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", altKey: true, ctrlKey: true }));
    expect(panel.style.display).toBe("none");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "∂", code: "KeyD", altKey: true, metaKey: true }));
    expect(panel.style.display).toBe("block");

    // Switch to Design Mode via Alt+X (using Option dead-key "≈" + KeyX)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "≈", code: "KeyX", altKey: true }));
    // Trigger freeze in Design Mode so tooltip renders
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "π", code: "KeyP", altKey: true }));
    expect(tooltipBox.textContent).toContain("Design Mode");
    expect(tooltipBox.textContent).toContain("Alt+Win+D for Filters");
    expect(tooltipBox.textContent).toContain("Win+U to Hide/Show");

    // Update shortcuts again via HOVERSOURCE_CONFIG_CHANGED while in Design Mode
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: {
          type: "HOVERSOURCE_CONFIG_CHANGED",
          config: {
            theme: "dark",
            shortcuts: {
              ...updatedShortcuts,
              toggleFilterPanel: { key: "f", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false },
            },
          },
        },
      })
    );
    expect(tooltipBox.textContent).toContain("Ctrl+Alt+F for Filters");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("allows mode shortcuts (Alt+C, Alt+P) when filterPanel checkbox or non-text input has focus, while blocking host text inputs", async () => {
    vi.useFakeTimers();
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();
    const shadow = document.getElementById("hoversource-host")!.shadowRoot!;

    const target = document.createElement("button");
    target.setAttribute("data-hs-source", "App.tsx:12:4");
    target.textContent = "Action";
    document.body.appendChild(target);
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([target]);

    target.dispatchEvent(new PointerEvent("pointerover", { clientX: 20, clientY: 20, bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);

    // Open filterPanel and focus a checkbox inside shadowRoot
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", altKey: true, ctrlKey: true }));
    const checkbox = shadow.querySelector('.hoversource-config-panel input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    checkbox.focus();
    expect(shadow.activeElement).toBe(checkbox);

    // Alt+C and Alt+P must still trigger while filterPanel checkbox has focus
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true }));
    expect(clipboardWriteMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", altKey: true }));
    expect(document.head.querySelectorAll("#hoversource-freeze-styles")).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", altKey: true }));

    // Host page checkbox (non-text input) must also allow shortcuts
    const hostCheckbox = document.createElement("input");
    hostCheckbox.type = "checkbox";
    document.body.appendChild(hostCheckbox);
    hostCheckbox.focus();
    expect(document.activeElement).toBe(hostCheckbox);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true }));
    expect(clipboardWriteMock).toHaveBeenCalledTimes(2);

    // Host page text input must still block shortcuts
    const hostTextInput = document.createElement("input");
    hostTextInput.type = "text";
    document.body.appendChild(hostTextInput);
    hostTextInput.focus();
    expect(document.activeElement).toBe(hostTextInput);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true }));
    expect(clipboardWriteMock).toHaveBeenCalledTimes(2);
  });

  it("applies filterPanel checkbox unchecks optimistically to Alt+C even when POST /config fails and falls back to global target", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      platform: "Win32",
      clipboard: { writeText: clipboardWriteMock },
    });

    const postBodies: Array<{ target?: string; config?: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const parsedUrl = String(url);
        if (parsedUrl.includes("/filter-presets/use") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          postBodies.push(body);
          return new Response(
            JSON.stringify({
              success: true,
              config: { metadataFilter: { preset: body.name, filters: {} } },
            }),
            { status: 200 }
          );
        }
        if (parsedUrl.includes("/filter-presets") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          postBodies.push(body);
          return new Response(
            JSON.stringify({ success: true, name: body.name, config: { metadataFilter: {} } }),
            { status: 200 }
          );
        }
        if (parsedUrl.includes("/config") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          postBodies.push(body);
          if (body.target === "local") {
            return new Response(JSON.stringify({ error: "EPERM: unwritable" }), { status: 500 });
          }
          return new Response(
            JSON.stringify({ success: true, config: { metadataFilter: body.config.metadataFilter } }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ config: {} }), { status: 200 });
      })
    );

    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();
    const shadow = document.getElementById("hoversource-host")!.shadowRoot!;

    const target = document.createElement("button");
    target.setAttribute("data-hs-source", "App.tsx:12:4");
    target.textContent = "Action";
    document.body.appendChild(target);
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([target]);

    target.dispatchEvent(new PointerEvent("pointerover", { clientX: 20, clientY: 20, bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", altKey: true, ctrlKey: true }));
    const frameworkCb = shadow.querySelector(
      '.hoversource-config-panel input[data-field="framework"]'
    ) as HTMLInputElement;
    expect(frameworkCb).not.toBeNull();
    frameworkCb.checked = false;
    frameworkCb.dispatchEvent(new Event("change"));

    // Synchronous Alt+C immediately after unchecking must exclude Framework
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true }));
    expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
    const copied = clipboardWriteMock.mock.calls[0][0] as string;
    expect(copied).toContain("Component");
    expect(copied).not.toContain("**Framework**");

    await vi.advanceTimersByTimeAsync(10);
    expect(postBodies.some((b) => b.target === "local")).toBe(true);
    expect(postBodies.some((b) => b.target === "global")).toBe(true);

    // Toggle scope button from Local to Global
    const scopeBtn = shadow.querySelector("#hoversource-scope-btn") as HTMLButtonElement;
    expect(scopeBtn.textContent).toBe("Local");
    scopeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    const updatedScopeBtn = shadow.querySelector("#hoversource-scope-btn") as HTMLButtonElement;
    expect(updatedScopeBtn.textContent).toBe("Global");

    // Manual uncheck switches preset selector to "custom" and reveals Save as Preset -> inline save flow
    const presetSelect = shadow.querySelector("#hoversource-preset-select") as HTMLSelectElement;
    expect(presetSelect.value).toBe("custom");
    const savePresetBtn = shadow.querySelector("#hoversource-save-preset-btn") as HTMLButtonElement;
    expect(savePresetBtn).not.toBeNull();
    savePresetBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const nameInput = shadow.querySelector("#hoversource-preset-name-input") as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    nameInput.value = "my-custom-filter";
    const confirmBtn = shadow.querySelector("#hoversource-save-preset-confirm") as HTMLButtonElement;
    confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(10);

    expect(
      postBodies.some((b: any) => b.name === "my-custom-filter" && b.filters?.component?.framework === false)
    ).toBe(true);
  });

  it("switches filter preset from Ctrl+Alt+D dropdown and sends POST /filter-presets/use", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const parsedUrl = String(url);
        if (parsedUrl.includes("/filter-presets/use") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          calls.push({ url: parsedUrl, body });
          return new Response(
            JSON.stringify({
              success: true,
              config: {
                metadataFilter: {
                  preset: body.name,
                  filters: { component: { componentName: true, filePath: true, dimensions: false } },
                },
              },
            }),
            { status: 200 }
          );
        }
        if (parsedUrl.includes("/filter-presets")) {
          return new Response(
            JSON.stringify({
              presets: {
                full: { component: { componentName: true, dimensions: true }, layer: {}, design: {} },
                "source-locate": { component: { componentName: true, dimensions: false }, layer: {}, design: {} },
              },
              sources: { full: "builtin", "source-locate": "builtin" },
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            config: {
              metadataFilter: {
                preset: "full",
                filters: { component: { componentName: true, dimensions: true } },
              },
            },
          }),
          { status: 200 }
        );
      })
    );

    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 1000 });
    expect(activeEngine).not.toBeNull();
    const shadow = document.getElementById("hoversource-host")!.shadowRoot!;

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", altKey: true, ctrlKey: true }));
    await vi.advanceTimersByTimeAsync(10);

    const presetSelect = shadow.querySelector("#hoversource-preset-select") as HTMLSelectElement;
    expect(presetSelect.value).toBe("full");

    presetSelect.value = "source-locate";
    presetSelect.dispatchEvent(new Event("change"));
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ name: "source-locate", target: "local" });
    expect(activeEngine!.getConfig().metadataFilter.preset).toBe("source-locate");
    expect(activeEngine!.getConfig().metadataFilter.filters.component.dimensions).toBe(false);
  });
});
