export interface ShortcutBinding {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey?: boolean;
}
export interface ScrollModifierConfig {
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey?: boolean;
}
export type ShortcutName = "toggleUI" | "toggleMinimal" | "toggleFreeze" | "copyMetadata" | "copyAllLayers" | "openDashboard" | "toggleMode" | "toggleFilterPanel";
export declare const DEFAULT_SHORTCUTS: Record<ShortcutName, ShortcutBinding>;
export declare const DEFAULT_LAYER_SCROLL_MODIFIERS: ScrollModifierConfig;
export declare function isMacPlatform(): boolean;
export declare function formatModifierLabel(mods: Partial<ScrollModifierConfig> | null | undefined, isMac?: boolean): string;
export declare function formatShortcutLabel(shortcut: Partial<ShortcutBinding> | null | undefined, isMac?: boolean): string;
export declare function matchShortcut(e: Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey">, shortcut: Partial<ShortcutBinding> | null | undefined): boolean;
export declare function matchScrollModifiers(e: Pick<WheelEvent, "altKey" | "ctrlKey" | "shiftKey" | "metaKey">, mods: Partial<ScrollModifierConfig> | null | undefined): boolean;
