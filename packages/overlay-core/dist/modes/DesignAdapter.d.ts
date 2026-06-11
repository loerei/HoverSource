import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";
export declare class DesignAdapter implements InteractionMode {
    readonly id = "design";
    private controller;
    private isFrozen;
    private resolver;
    private targetElement;
    private targetRect;
    private anchorHElement;
    private anchorVElement;
    private isSnappedH;
    private isSnappedV;
    private snapBoundaryH;
    private snapBoundaryV;
    private snapX;
    private snapY;
    private snapMouseX;
    private snapMouseY;
    private dX;
    private dY;
    private lastMouseX;
    private lastMouseY;
    private crosshairX;
    private crosshairY;
    private isDragging;
    private dragStartX;
    private dragStartY;
    private dragStartCrosshairX;
    private dragStartCrosshairY;
    private svgOverlay;
    private badgeElementH;
    private badgeElementV;
    private dragBlocker;
    activate(controller: OverlayController): void;
    deactivate(): void;
    onPointerOver(event: PointerEvent, target: HTMLElement): void;
    onPointerMove(event: PointerEvent): void;
    private updateTargetAtPosition;
    private handleDragStart;
    private handleDragMove;
    private handleDragEnd;
    private checkSnapping;
    private updateVisuals;
    private renderTooltip;
    onShortcut(command: SemanticShortcut): void;
    private handleKeyDown;
    private copyMetadata;
    onConfigUpdate(newConfig: any): void;
    onUIVisibilityChanged(visible: boolean): void;
}
export interface SnapResult {
    horizontal: {
        boundary: "Left-Edge" | "Right-Edge" | "Center-Axis";
        offset: number;
        distance: number;
        value: number;
    };
    vertical: {
        boundary: "Top-Edge" | "Bottom-Edge" | "Center-Axis";
        offset: number;
        distance: number;
        value: number;
    };
}
export declare function findNearestSnapPoint(x: number, y: number, rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
}): SnapResult;
export declare function shouldReleaseSnap(mouseX: number, mouseY: number, snapMouseX: number, snapMouseY: number, deadzone: number): boolean;
export declare function calculateNudge(key: string, shiftKey: boolean, currentDx: number, currentDy: number): {
    dX: number;
    dY: number;
};
export declare function getLayoutRules(boundaryH: "Left-Edge" | "Right-Edge" | "Center-Axis" | null, boundaryV: "Top-Edge" | "Bottom-Edge" | "Center-Axis" | null, dX: number, dY: number): string;
export declare function findCommonAncestor(el1: HTMLElement | null, el2: HTMLElement | null): HTMLElement;
export declare function getSelector(el: HTMLElement | null): string;
export declare function getSuggestedCSS(boundaryH: "Left-Edge" | "Right-Edge" | "Center-Axis" | null, boundaryV: "Top-Edge" | "Bottom-Edge" | "Center-Axis" | null, offsetH: number, offsetV: number, parentContainer: HTMLElement, activeX: number, activeY: number, anchorH: HTMLElement | null, anchorV: HTMLElement | null): string;
