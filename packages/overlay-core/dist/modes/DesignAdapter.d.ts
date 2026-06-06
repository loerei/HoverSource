import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";
export declare class DesignAdapter implements InteractionMode {
    readonly id = "design";
    private controller;
    private isFrozen;
    activate(controller: OverlayController): void;
    deactivate(): void;
    onPointerOver(event: PointerEvent, target: HTMLElement): void;
    onPointerMove(event: PointerEvent): void;
    onShortcut(command: SemanticShortcut): void;
    onConfigUpdate(newConfig: any): void;
    onUIVisibilityChanged(visible: boolean): void;
}
