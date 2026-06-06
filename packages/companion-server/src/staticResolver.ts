import fs from "node:fs";
import path from "node:path";

/** Strip JSDoc/block/line comment markers from a single comment line. */
function stripCommentMarkers(line: string): string {
  let s = line.trim();
  // /** or /*
  if (s.startsWith("/**")) s = s.slice(3);
  else if (s.startsWith("/*")) s = s.slice(2);
  // * (interior block comment line)
  else if (s.startsWith("*")) s = s.slice(1);
  // //
  else if (s.startsWith("//")) s = s.slice(2);
  // trailing */
  if (s.endsWith("*/")) s = s.slice(0, -2);
  return s.trim();
}

export interface StaticMetadata {
  rawAttributes: Record<string, string>;
  comments: string[];
  classOrigins: Record<string, { file: string; line: number; column: number }>;
}

function getAllCssFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const base = path.basename(filePath);
        if (
          base !== "node_modules" &&
          base !== ".git" &&
          base !== "dist" &&
          base !== "build" &&
          base !== "out" &&
          base !== ".gemini" &&
          base !== ".agents"
        ) {
          getAllCssFiles(filePath, fileList);
        }
      } else if (file.endsWith(".css")) {
        fileList.push(filePath);
      }
    }
  } catch {}
  return fileList;
}

function findClassOrigins(projectRoot: string, classNames: string[]): Record<string, { file: string; line: number; column: number }> {
  const origins: Record<string, { file: string; line: number; column: number }> = {};
  const cssFiles = getAllCssFiles(projectRoot);

  for (const file of cssFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split(/\r?\n/);
      
      for (const className of classNames) {
        if (origins[className]) continue;

        const pattern = new RegExp(String.raw`\.${className}\b`);
        for (let i = 0; i < lines.length; i++) {
          const match = pattern.exec(lines[i]);
          if (match?.index !== undefined) {
            origins[className] = {
              file: file.replaceAll("\\", "/"),
              line: i + 1,
              column: match.index + 1
            };
            break;
          }
        }
      }
    } catch {}
  }
  return origins;
}

export class StaticContextResolver {
  private findOffsetTagLine(lines: string[], tagLineIdx: number, tagPattern: RegExp): number {
    for (let offset = 1; offset <= 5; offset++) {
      if (tagLineIdx - offset >= 0 && tagPattern.test(lines[tagLineIdx - offset])) {
        return tagLineIdx - offset;
      }
      if (tagLineIdx + offset < lines.length && tagPattern.test(lines[tagLineIdx + offset])) {
        return tagLineIdx + offset;
      }
    }
    return tagLineIdx;
  }

  private findTagLineIndex(lines: string[], line: number, tagName?: string): number {
    const tagLineIdx = line - 1;
    if (tagLineIdx < 0 || tagLineIdx >= lines.length || !tagName) {
      return tagLineIdx;
    }

    const tagPattern = new RegExp(String.raw`<${tagName}\b`, "i");
    if (tagPattern.test(lines[tagLineIdx])) {
      return tagLineIdx;
    }
    return this.findOffsetTagLine(lines, tagLineIdx, tagPattern);
  }

  private scanLineChars(currentLine: string, state: { inString: boolean; stringChar: string; openBracketCount: number }): boolean {
    for (let i = 0; i < currentLine.length; i++) {
      const char = currentLine[i];
      if (state.inString) {
        if (char === state.stringChar && currentLine[i - 1] !== "\\") {
          state.inString = false;
        }
      } else if (char === '"' || char === "'" || char === "`") {
        state.inString = true;
        state.stringChar = char;
      } else if (char === "{") {
        state.openBracketCount++;
      } else if (char === "}") {
        state.openBracketCount--;
      } else if (char === ">" && state.openBracketCount === 0) {
        return true;
      }
    }
    return false;
  }

  private accumulateTagSegment(lines: string[], tagLineIdx: number): string {
    let segment = "";
    let scanIdx = tagLineIdx;
    const state = { inString: false, stringChar: "", openBracketCount: 0 };

    while (scanIdx < lines.length && scanIdx < tagLineIdx + 10) {
      const currentLine = lines[scanIdx];
      segment += " " + currentLine;
      if (this.scanLineChars(currentLine, state)) {
        break;
      }
      scanIdx++;
    }
    return segment;
  }

  private processSingleAttribute(attrMatch: RegExpExecArray, rawAttributes: Record<string, string>): void {
    const name = attrMatch[1];
    let value = attrMatch[2] ?? "true";
    if (value.length >= 2) {
      const first = value[0];
      const last = value.at(-1);
      if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === "{" && last === "}")) {
        value = value.slice(1, -1);
      }
    }
    if (!name.startsWith("_debug") && name !== "key") {
      rawAttributes[name] = value.trim().replaceAll(/\s+/g, " ");
    }
  }

  private parseAttributes(tagName: string, segment: string, rawAttributes: Record<string, string>): void {
    const tagPattern = new RegExp(String.raw`<${tagName}\b([\s\S]*?)(?:/\s*)?>`, "i");
    const match = tagPattern.exec(segment);
    if (match?.[1]) {
      const attrSegment = match[1].trim();
      const attrRegex = /([\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|{[^}]+}))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrSegment)) !== null) {
        this.processSingleAttribute(attrMatch, rawAttributes);
      }
    }
  }

  private parsePrecedingComments(lines: string[], tagLineIdx: number): string[] {
    const commentLines: string[] = [];
    let inBlockComment = false;
    let checkIdx = tagLineIdx - 1;

    while (checkIdx >= 0 && checkIdx >= tagLineIdx - 15) {
      const lineText = lines[checkIdx].trim();
      
      if (lineText.endsWith("*/")) {
        inBlockComment = true;
        if (lineText.startsWith("/*") || lineText.startsWith("/**")) {
          commentLines.unshift(lineText);
          inBlockComment = false;
        } else {
          commentLines.unshift(lineText);
        }
      } else if (inBlockComment) {
        commentLines.unshift(lineText);
        if (lineText.startsWith("/*") || lineText.startsWith("/**")) {
          inBlockComment = false;
        }
      } else if (lineText.startsWith("//")) {
        commentLines.unshift(lineText);
      } else if (lineText !== "") {
        break;
      }
      checkIdx--;
    }

    if (commentLines.length > 0) {
      return commentLines.map(c => stripCommentMarkers(c)).filter(c => c !== "");
    }
    return [];
  }

  public async resolveStaticContext(
    projectRoot: string,
    filePath: string,
    line: number,
    column: number,
    tagName?: string,
    classList?: string[]
  ): Promise<StaticMetadata> {
    const result: StaticMetadata = {
      rawAttributes: {},
      comments: [],
      classOrigins: {}
    };

    if (!fs.existsSync(filePath)) {
      return result;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split(/\r?\n/);

      // 1. Locate the opening tag line index
      const tagLineIdx = this.findTagLineIndex(lines, line, tagName);
      if (tagLineIdx < 0 || tagLineIdx >= lines.length) {
        return result;
      }

      // 2. Extract raw attributes by reading lines forward starting from tagLineIdx
      const segment = this.accumulateTagSegment(lines, tagLineIdx);

      // Parse attributes from the accumulated segment
      if (tagName) {
        this.parseAttributes(tagName, segment, result.rawAttributes);
      }

      // 3. Extract comments preceding the tag
      result.comments = this.parsePrecedingComments(lines, tagLineIdx);

      if (classList && classList.length > 0) {
        result.classOrigins = findClassOrigins(projectRoot, classList);
      }

    } catch (e) {
      console.warn(`[HoverSource] Failed to parse static context for ${filePath}`, e);
    }

    return result;
  }
}
