import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";
export declare class InspectorAdapter implements InteractionMode {
    readonly id = "inspector";
    private controller;
    private resolver;
    private isFrozen;
    private minimalMode;
    private currentElement;
    private currentSourceInfo;
    activate(controller: OverlayController): void;
    deactivate(): void;
    onPointerOver(event: PointerEvent, target: HTMLElement): void;
    onPointerMove(event: PointerEvent): void;
    onShortcut(command: SemanticShortcut): void;
    onConfigUpdate(newConfig: any): void;
    onUIVisibilityChanged(visible: boolean): void;
    private fetchBackgroundValidation;
    private renderTooltip;
    private copyMetadata;
}
