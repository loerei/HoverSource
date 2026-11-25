export const DEFAULT_SHORTCUTS = {
    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true, metaKey: false },
    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
    toggleFilterPanel: { key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false },
};
export const DEFAULT_LAYER_SCROLL_MODIFIERS = {
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
};
export function isMacPlatform() {
    if (typeof navigator === "undefined")
        return false;
    const nav = navigator;
    const platform = nav.userAgentData?.platform || navigator.platform || "";
    return /mac/i.test(platform);
}
export function formatModifierLabel(mods, isMac = isMacPlatform()) {
    if (!mods)
        return "";
    const parts = [];
    if (isMac) {
        if (mods.ctrlKey)
            parts.push("⌃");
        if (mods.altKey)
            parts.push("⌥");
        if (mods.shiftKey)
            parts.push("⇧");
        if (mods.metaKey)
            parts.push("⌘");
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
export function formatShortcutLabel(shortcut, isMac = isMacPlatform()) {
    if (!shortcut?.key)
        return "";
    const modLabel = formatModifierLabel(shortcut, isMac);
    const keyLabel = shortcut.key.length === 1
        ? shortcut.key.toUpperCase()
        : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
    if (!modLabel)
        return keyLabel;
    return isMac ? `${modLabel}${keyLabel}` : `${modLabel}+${keyLabel}`;
}
export function matchShortcut(e, shortcut) {
    if (!shortcut?.key)
        return false;
    if (!!e.altKey !== !!shortcut.altKey ||
        !!e.ctrlKey !== !!shortcut.ctrlKey ||
        !!e.shiftKey !== !!shortcut.shiftKey ||
        !!e.metaKey !== !!shortcut.metaKey) {
        return false;
    }
    const targetKey = shortcut.key.toLowerCase();
    const keyMatch = typeof e.key === "string" && e.key.toLowerCase() === targetKey;
    const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
    const codeMatch = code.length > 0 &&
        (code === targetKey || code === `key${targetKey}` || code === `digit${targetKey}`);
    return keyMatch || !!codeMatch;
}
export function matchScrollModifiers(e, mods) {
    if (!mods)
        return false;
    return (!!e.altKey === !!mods.altKey &&
        !!e.ctrlKey === !!mods.ctrlKey &&
        !!e.shiftKey === !!mods.shiftKey &&
        !!e.metaKey === !!mods.metaKey);
}
