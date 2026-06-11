export interface ParentVisualEffect {
  tagName: string;
  classList: string[];
  property: string;
  value: string;
}

export interface VisualContext {
  parentEffects: ParentVisualEffect[];
  layoutConstraints: Record<string, string>;
}

export interface StaticMetadata {
  rawAttributes?: Record<string, string>;
  comments?: string[];
  classOrigins?: Record<string, { file: string; line: number; column: number }>;
}

export interface SourceInfo {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
  componentName?: string;
  framework: string;
  tagName?: string;
  classList?: string[];
  visualContext?: VisualContext;
  staticMetadata?: StaticMetadata;
}

export interface SourceAdapter {
  name: string;
  canResolve(element: HTMLElement): boolean;
  resolve(element: HTMLElement): SourceInfo | null;
}

/** Resolved info for a single DOM ancestor during layout context collection. */
export interface AncestorInfo {
  /** CSS selector for the element */
  selector: string;
  /** computed display value (block, flex, grid, etc.) */
  display: string;
  /** computed position value (static, relative, absolute, fixed, sticky) */
  position: string;
  /** Additional flex/grid props, only present when display is flex or grid */
  layoutProps?: Record<string, string>;
  /** Source file resolved via fiber, undefined when not resolvable */
  fileName?: string;
  lineNumber?: number;
  componentName?: string;
}
