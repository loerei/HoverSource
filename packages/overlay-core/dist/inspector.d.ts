import { VisualContext } from "@hoversource/source-resolver";
export declare function clearInspectorCache(): void;
export declare function disconnectInspectorMutationObserver(): void;
export declare function initInspectorMutationObserver(timeoutMs?: number, signal?: AbortSignal): Promise<MutationObserver | null>;
export declare function inspectVisualContext(element: HTMLElement, maxDepth?: number): VisualContext;
