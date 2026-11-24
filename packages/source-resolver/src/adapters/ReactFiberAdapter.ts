import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata } from "./utils.js";
import { isBundlerOrRuntimeFrame, parseV8StackLine } from "./stackFrame.js";

function extractComponentNameFromType(type: any, depth = 0): string | undefined {
  if (!type || depth > 5) return undefined;

  if (typeof type === "function") {
    return type.displayName || type.name || undefined;
  }

  if (typeof type === "object") {
    if (typeof type.displayName === "string" && type.displayName) {
      return type.displayName;
    }
    if (type.render) {
      return extractComponentNameFromType(type.render, depth + 1);
    }
    if (type.type) {
      return extractComponentNameFromType(type.type, depth + 1);
    }
    if (typeof type.name === "string" && type.name) {
      return type.name;
    }
  }

  return undefined;
}

function sanitizeStackFunctionName(functionName?: string): string | undefined {
  if (!functionName) return undefined;
  const trimmed = functionName.trim();
  if (
    !trimmed ||
    trimmed === "Object" ||
    trimmed === "<anonymous>" ||
    trimmed.endsWith(".<anonymous>")
  ) {
    return undefined;
  }
  return trimmed;
}

export class ReactFiberAdapter implements SourceAdapter {
  name = "react-fiber";

  private getFiber(element: HTMLElement): any {
    const keys = Object.keys(element);
    const fiberKey = keys.find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
    );
    if (!fiberKey) return null;
    return (element as any)[fiberKey];
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getFiber(element);
  }

  private findComponentNameFromFiber(fiber: any): string | undefined {
    let owner = fiber?._debugOwner;
    const visitedOwners = new Set<any>();

    while (owner && !visitedOwners.has(owner)) {
      visitedOwners.add(owner);

      if (typeof owner.tag === "number" || owner.type !== undefined) {
        const name = extractComponentNameFromType(owner.type);
        if (name) return name;
        owner = owner._debugOwner ?? owner.owner;
      } else if (typeof owner.name === "string") {
        if (owner.name) return owner.name;
        owner = owner.owner ?? owner._debugOwner;
      } else {
        owner = owner._debugOwner ?? owner.owner;
      }
    }

    const ownName = extractComponentNameFromType(fiber?.type);
    if (ownName) return ownName;

    let current = fiber?.return;
    const visitedFibers = new Set<any>();
    while (current && !visitedFibers.has(current)) {
      visitedFibers.add(current);
      const name = extractComponentNameFromType(current.type);
      if (name) return name;
      current = current.return;
    }

    return undefined;
  }

  private extractDebugStackLocation(debugStack: any) {
    const stack = debugStack?.stack;
    if (typeof stack !== "string") return null;

    for (const line of stack.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Error:") || !trimmed.startsWith("at ")) {
        continue;
      }
      if (isBundlerOrRuntimeFrame(trimmed)) {
        continue;
      }
      const parsed = parseV8StackLine(trimmed, { preserveHttpOrigin: true });
      if (parsed && parsed.fileName !== "<anonymous>") {
        return parsed;
      }
    }

    return null;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const startFiber = this.getFiber(element);
    if (!startFiber) return null;

    let fiber = startFiber;
    const visited = new Set<any>();

    // Walk up the fiber tree if the current node doesn't have a debug source or stack,
    // as some wrapper divs or host elements might not have it directly.
    while (fiber && !visited.has(fiber)) {
      visited.add(fiber);

      const source = fiber._debugSource;
      if (source) {
        const componentName = this.findComponentNameFromFiber(fiber);

        return {
          fileName: source.fileName,
          lineNumber: source.lineNumber,
          columnNumber: source.columnNumber,
          componentName,
          framework: "React",
          ...getElementMetadata(element)
        };
      }

      const stackFrame = this.extractDebugStackLocation(fiber._debugStack);
      if (stackFrame) {
        const componentName =
          this.findComponentNameFromFiber(fiber) ||
          sanitizeStackFunctionName(stackFrame.functionName);

        return {
          fileName: stackFrame.fileName,
          lineNumber: stackFrame.lineNumber,
          columnNumber: stackFrame.columnNumber,
          componentName,
          framework: "React",
          ...getElementMetadata(element)
        };
      }

      fiber = fiber.return;
    }

    const fallbackComponentName = this.findComponentNameFromFiber(startFiber);
    if (fallbackComponentName) {
      return {
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        componentName: fallbackComponentName,
        framework: "React",
        ...getElementMetadata(element)
      };
    }

    return null;
  }
}
