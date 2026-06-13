import { describe, it, expect } from "vitest";
import { normalizeProjectPath } from "../server.js";

describe("normalizeProjectPath", () => {
  it("should normalize backslashes to forward slashes", () => {
    const result = normalizeProjectPath("C:\\Projects\\HoverSource");
    expect(result).toBe("C:/Projects/HoverSource");
  });

  it("should force Windows drive letter to uppercase", () => {
    const lowercaseResult = normalizeProjectPath("d:/Projects/HoverSource");
    const uppercaseResult = normalizeProjectPath("D:/Projects/HoverSource");
    
    expect(lowercaseResult).toBe("D:/Projects/HoverSource");
    expect(uppercaseResult).toBe("D:/Projects/HoverSource");
  });

  it("should handle mixed slashes and lowercase drive letters", () => {
    const result = normalizeProjectPath("c:\\projects/HoverSource\\subfolder");
    expect(result).toBe("C:/projects/HoverSource/subfolder");
  });
});
