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
  stylesheetOrigin?: {
    file: string;
    line: number;
  };
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
