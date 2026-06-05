import fs from "node:fs";
import path from "node:path";

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

        const pattern = new RegExp(`\\.${className}\\b`);
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(pattern);
          if (match && match.index !== undefined) {
            origins[className] = {
              file: file.replace(/\\/g, "/"),
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
      let tagLineIdx = line - 1;
      if (tagLineIdx < 0 || tagLineIdx >= lines.length) {
        return result;
      }

      // If we have a tagName, let's verify if `<tagName` is present in this line.
      // If not, search a bit upwards/downwards (range of 5 lines) to find the correct line index.
      if (tagName) {
        const tagPattern = new RegExp(`<${tagName}\\b`, "i");
        if (!tagPattern.test(lines[tagLineIdx])) {
          for (let offset = 1; offset <= 5; offset++) {
            if (tagLineIdx - offset >= 0 && tagPattern.test(lines[tagLineIdx - offset])) {
              tagLineIdx -= offset;
              break;
            }
            if (tagLineIdx + offset < lines.length && tagPattern.test(lines[tagLineIdx + offset])) {
              tagLineIdx += offset;
              break;
            }
          }
        }
      }

      // 2. Extract raw attributes by reading lines forward starting from tagLineIdx
      let segment = "";
      let scanIdx = tagLineIdx;
      let openBracketCount = 0;
      let inString = false;
      let stringChar = "";

      // Accumulate text until tag ends (closed by > or />)
      while (scanIdx < lines.length && scanIdx < tagLineIdx + 10) {
        const currentLine = lines[scanIdx];
        segment += " " + currentLine;
        
        let ended = false;
        for (let i = 0; i < currentLine.length; i++) {
          const char = currentLine[i];
          if (inString) {
            if (char === stringChar && currentLine[i - 1] !== "\\") {
              inString = false;
            }
          } else if (char === '"' || char === "'" || char === "`") {
            inString = true;
            stringChar = char;
          } else if (char === "{") {
            openBracketCount++;
          } else if (char === "}") {
            openBracketCount--;
          } else if (char === ">" && openBracketCount === 0) {
            ended = true;
            break;
          }
        }

        if (ended) break;
        scanIdx++;
      }

      // Parse attributes from the accumulated segment
      if (tagName) {
        const tagPattern = new RegExp(`<${tagName}\\b([\\s\\S]*?)(?:/\\s*)?>`, "i");
        const match = segment.match(tagPattern);
        if (match && match[1]) {
          const attrSegment = match[1].trim();
          const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|{([\s\S]*?)}))?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrSegment)) !== null) {
            const name = attrMatch[1];
            const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "true";
            if (!name.startsWith("_debug") && name !== "key") {
              result.rawAttributes[name] = value.trim().replace(/\s+/g, " ");
            }
          }
        }
      }

      // 3. Extract comments preceding the tag
      let commentLines: string[] = [];
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
        } else {
          if (lineText !== "") {
            break;
          }
        }
        checkIdx--;
      }

      if (commentLines.length > 0) {
        result.comments = commentLines.map(c => {
          return c
            .replace(/^\/\*\*\s*/, "")
            .replace(/^\/\*\s*/, "")
            .replace(/^\*\s*/, "")
            .replace(/\s*\*\/$/, "")
            .replace(/^\/\/\s*/, "")
            .trim();
        }).filter(c => c !== "");
      }

      if (classList && classList.length > 0) {
        result.classOrigins = findClassOrigins(projectRoot, classList);
      }

    } catch (e) {
      console.warn(`[HoverSource] Failed to parse static context for ${filePath}`, e);
    }

    return result;
  }
}
