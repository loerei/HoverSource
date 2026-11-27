import { describe, it, expect } from "vitest";
import {
  formatProjectPath,
  formatSourceLocation,
  collapseOverflowPairs,
} from "./formatUtils.js";

describe("formatUtils", () => {
  it("strips matching workspace root prefix cleanly while leaving external paths and URLs intact", () => {
    expect(
      formatProjectPath(
        "d:\\Projects\\HoverSource\\packages\\ui\\Button.tsx",
        "D:/Projects/HoverSource/"
      )
    ).toEqual({
      path: "packages/ui/Button.tsx",
      stripped: true,
    });

    expect(
      formatProjectPath("C:\\WINDOWS\\system32\\user32.dll", "D:/Projects/HoverSource")
    ).toEqual({
      path: "C:/WINDOWS/system32/user32.dll",
      stripped: false,
    });

    expect(
      formatProjectPath("https://cdn.example.com/styles.css", "D:/Projects/HoverSource")
    ).toEqual({
      path: "https://cdn.example.com/styles.css",
      stripped: false,
    });

    // Must not match a sibling folder whose name shares a prefix
    expect(
      formatProjectPath("D:/Projects/HoverSource-copy/src/App.tsx", "D:/Projects/HoverSource")
    ).toEqual({
      path: "D:/Projects/HoverSource-copy/src/App.tsx",
      stripped: false,
    });
  });

  it("formats coordinates as path:line:col and collapses identical overflow axes", () => {
    expect(
      formatSourceLocation(
        "D:/Projects/HoverSource/src/App.tsx",
        42,
        7,
        "D:/Projects/HoverSource"
      )
    ).toEqual({
      text: "src/App.tsx:42:7",
      stripped: true,
    });

    expect(formatSourceLocation("src/App.tsx", 42, 0)).toEqual({
      text: "src/App.tsx:42",
      stripped: false,
    });

    expect(
      collapseOverflowPairs([
        ["display", "flex"],
        ["overflow-x", "hidden"],
        ["overflow-y", "hidden"],
      ])
    ).toEqual([
      ["display", "flex"],
      ["overflow", "hidden"],
    ]);

    expect(
      collapseOverflowPairs([
        ["overflow-x", "visible"],
        ["overflow-y", "auto"],
      ])
    ).toEqual([
      ["overflow-x", "visible"],
      ["overflow-y", "auto"],
    ]);
  });
});
