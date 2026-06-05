export interface SourceInfo {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
  componentName?: string;
  framework: string;
  tagName?: string;
  classList?: string[];
}

export interface SourceAdapter {
  name: string;
  canResolve(element: HTMLElement): boolean;
  resolve(element: HTMLElement): SourceInfo | null;
}
