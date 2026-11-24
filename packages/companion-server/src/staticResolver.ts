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

export interface StaticHtmlQuery {
  tagName: string;
  id?: string;
  classList?: string[];
  attributes?: Record<string, string>;
  textContent?: string;
}

export interface StaticHtmlEntry {
  tagName: string;
  id?: string;
  classList: string[];
  attributes: Record<string, string>;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

export interface StaticHtmlLocation {
  fileName: string;
  absolutePath: string;
  lineNumber: number;
  columnNumber: number;
  framework: string;
}

function escapeRegex(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      } else {
        const ext = path.extname(file).toLowerCase();
        if (ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less") {
          fileList.push(filePath);
        }
      }
    }
  } catch {}
  return fileList;
}

function sortCssFiles(cssFiles: string[], componentFilePath?: string): string[] {
  if (!componentFilePath) return cssFiles;
  const componentDir = path.dirname(componentFilePath);
  const componentBase = path.basename(componentFilePath, path.extname(componentFilePath));
  
  return [...cssFiles].sort((a, b) => {
    const dirA = path.dirname(a);
    const dirB = path.dirname(b);
    const baseA = path.basename(a, path.extname(a));
    const baseB = path.basename(b, path.extname(b));
    
    const inSameDirA = dirA === componentDir;
    const inSameDirB = dirB === componentDir;
    
    const baseMatchA = baseA.startsWith(componentBase) || componentBase.startsWith(baseA);
    const baseMatchB = baseB.startsWith(componentBase) || componentBase.startsWith(baseB);
    
    if ((inSameDirA && baseMatchA) && !(inSameDirB && baseMatchB)) return -1;
    if (!(inSameDirA && baseMatchA) && (inSameDirB && baseMatchB)) return 1;
    
    if (inSameDirA && !inSameDirB) return -1;
    if (!inSameDirA && inSameDirB) return 1;
    
    if (baseMatchA && !baseMatchB) return -1;
    if (!baseMatchA && baseMatchB) return 1;
    
    return 0;
  });
}

function handleDoubleUnderscore(className: string, candidates: Set<string>) {
  const parts = className.split("__");
  const prefix = parts[0];
  if (!prefix) return;
  candidates.add(prefix);
  
  const subParts = prefix.split("_");
  for (const part of subParts) {
    if (part) candidates.add(part);
  }
  if (subParts.length > 1) {
    const lastPart = subParts.at(-1);
    if (lastPart) candidates.add(lastPart);
  }
}

function handleSingleUnderscorePrefix(className: string, candidates: Set<string>) {
  const parts = className.split("_").filter(Boolean);
  for (const part of parts) {
    if (part) candidates.add(part);
  }
  if (parts.length > 1) {
    const secondLastPart = parts.at(-2);
    if (secondLastPart) candidates.add(secondLastPart);
  }
}

function getCandidateClassNames(className: string): string[] {
  const candidates = new Set<string>([className]);
  if (className.includes("__")) {
    handleDoubleUnderscore(className, candidates);
  } else if (className.startsWith("_")) {
    handleSingleUnderscorePrefix(className, candidates);
  }
  return Array.from(candidates);
}

function splitSelectorList(selectorListStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  
  for (const char of selectorListStr) {
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (char === "," && parenDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function extractClassNamesFromSelector(selector: string): string[] {
  const classNames: string[] = [];
  const classPattern = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = classPattern.exec(selector)) !== null) {
    classNames.push(match[1]);
  }
  return classNames;
}

interface SelectorOrigin {
  selector: string;
  line: number;
  column: number;
}

function resolveNestedSelectors(
  rawSel: string,
  braceStack: string[][],
  origins: SelectorOrigin[],
  line: number,
  col: number
): string[] {
  const newSelectors: string[] = [];
  if (!rawSel) return newSelectors;

  const splitSels = splitSelectorList(rawSel);
  const parentList = braceStack.at(-1) ?? [];
  const activeParentSelectors = parentList.filter(p => !p.trim().startsWith("@"));

  for (const sel of splitSels) {
    const trimmedSel = sel.trim();
    if (!trimmedSel) continue;

    if (activeParentSelectors.length > 0) {
      for (const parentSel of activeParentSelectors) {
        const resolved = trimmedSel.includes("&")
          ? trimmedSel.replaceAll("&", parentSel)
          : `${parentSel} ${trimmedSel}`;
        newSelectors.push(resolved);
        origins.push({
          selector: resolved,
          line,
          column: col
        });
      }
    } else {
      newSelectors.push(trimmedSel);
      origins.push({
        selector: trimmedSel,
        line,
        column: col
      });
    }
  }
  return newSelectors;
}

class SelectorParser {
  private line = 1;
  private column = 1;
  private inString: string | null = null;
  private inComment: "line" | "block" | null = null;
  private readonly braceStack: string[][] = [];
  private currentSelector = "";
  private selectorStartLine = 1;
  private selectorStartCol = 1;
  private readonly origins: SelectorOrigin[] = [];

  constructor(private readonly content: string) {}

  private advancePos(c: string) {
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
  }

  parse(): SelectorOrigin[] {
    for (let i = 0; i < this.content.length; i++) {
      i += this.parseNext(i);
    }
    return this.origins;
  }

  private parseNext(i: number): number {
    const char = this.content[i];
    const nextChar = this.content[i + 1] || "";

    if (this.handleComments(char, nextChar)) {
      if (this.inComment === null && char === "*") {
        return 1; // skip "/"
      }
      return 0;
    }

    if (this.handleStrings(char, nextChar)) {
      if (char === "\\") {
        return 1; // skip escaped char
      }
      return 0;
    }

    if (this.detectCommentOrStringStart(char, nextChar)) {
      if (char === "/") {
        return 1; // skip the second comment char
      }
      return 0;
    }

    if (this.handleSpecialChars(char)) {
      return 0;
    }

    this.accumulateSelector(char);
    return 0;
  }

  private handleComments(char: string, nextChar: string): boolean {
    if (this.inComment === "line") {
      if (char === "\n") {
        this.inComment = null;
      }
      this.advancePos(char);
      return true;
    }

    if (this.inComment === "block") {
      if (char === "*" && nextChar === "/") {
        this.inComment = null;
        this.column += 2;
        return true;
      }
      this.advancePos(char);
      return true;
    }

    return false;
  }

  private handleStrings(char: string, nextChar: string): boolean {
    if (this.inString !== null) {
      if (char === "\\" && nextChar) {
        this.advancePos(char);
        this.advancePos(nextChar);
        return true;
      }
      if (char === this.inString) {
        this.inString = null;
      }
      this.advancePos(char);
      return true;
    }
    return false;
  }

  private detectCommentOrStringStart(char: string, nextChar: string): boolean {
    if (char === "/" && nextChar === "/") {
      this.inComment = "line";
      this.column += 2;
      return true;
    }
    if (char === "/" && nextChar === "*") {
      this.inComment = "block";
      this.column += 2;
      return true;
    }
    if (char === '"' || char === "'" || char === "`") {
      this.inString = char;
      this.advancePos(char);
      return true;
    }
    return false;
  }

  private handleSpecialChars(char: string): boolean {
    if (char === "{") {
      const rawSel = this.currentSelector.trim();
      const newSelectors = resolveNestedSelectors(
        rawSel,
        this.braceStack,
        this.origins,
        this.selectorStartLine,
        this.selectorStartCol
      );
      const fallback = rawSel ? [rawSel] : [];
      this.braceStack.push(newSelectors.length > 0 ? newSelectors : fallback);
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    if (char === "}") {
      this.braceStack.pop();
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    if (char === ";") {
      this.currentSelector = "";
      this.advancePos(char);
      return true;
    }

    return false;
  }

  private accumulateSelector(char: string) {
    if (this.currentSelector.trim() === "") {
      this.selectorStartLine = this.line;
      this.selectorStartCol = this.column;
    }
    this.currentSelector += char;
    this.advancePos(char);
  }
}

function parseSelectors(content: string): SelectorOrigin[] {
  return new SelectorParser(content).parse();
}

function findClassOrigins(
  projectRoot: string,
  classNames: string[],
  componentFilePath?: string
): Record<string, { file: string; line: number; column: number }> {
  const origins: Record<string, { file: string; line: number; column: number }> = {};
  const cssFiles = getAllCssFiles(projectRoot);
  const sortedCssFiles = sortCssFiles(cssFiles, componentFilePath);
  
  for (const file of sortedCssFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const selectorOrigins = parseSelectors(content);
      
      for (const className of classNames) {
        if (origins[className]) continue;
        
        const candidates = getCandidateClassNames(className);
        
        for (const origin of selectorOrigins) {
          const selectorClasses = extractClassNamesFromSelector(origin.selector);
          const hasMatch = candidates.some(c => selectorClasses.includes(c));
          
          if (hasMatch) {
            origins[className] = {
              file: file.replaceAll("\\", "/"),
              line: origin.line,
              column: origin.column
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

  private extractAttributeValue(remaining: string): { value: string; consumedLength: number } | null {
    if (!remaining.startsWith("=")) {
      return null;
    }
    const target = remaining.slice(1).trim();
    const prefixLength = remaining.length - target.length;
    
    let valMatch = null;
    if (target.startsWith('"')) {
      valMatch = /^"([^"]*)"/.exec(target);
    } else if (target.startsWith("'")) {
      valMatch = /^'([^']*)'/.exec(target);
    } else if (target.startsWith("{")) {
      valMatch = /^{([^}]+)}/.exec(target);
    } else {
      valMatch = /^([^\s>]+)/.exec(target);
    }

    if (valMatch) {
      return {
        value: valMatch[1] ?? valMatch[0],
        consumedLength: prefixLength + valMatch[0].length,
      };
    }
    return {
      value: "true",
      consumedLength: prefixLength,
    };
  }

  private parseAttributes(tagName: string, segment: string, rawAttributes: Record<string, string>): void {
    const tagPattern = new RegExp(String.raw`<${tagName}\b([\s\S]*?)(?:/\s*)?>`, "i");
    const match = tagPattern.exec(segment);
    if (match?.[1]) {
      let remaining = match[1].trim();
      while (remaining.length > 0) {
        remaining = remaining.trim();
        const keyMatch = /^([\w-]+)/.exec(remaining);
        if (!keyMatch) break;
        const name = keyMatch[1];
        remaining = remaining.slice(name.length).trim();
        
        let value = "true";
        const valResult = this.extractAttributeValue(remaining);
        if (valResult) {
          value = valResult.value;
          remaining = remaining.slice(valResult.consumedLength);
        }
        
        if (!name.startsWith("_debug") && name !== "key") {
          rawAttributes[name] = value.trim().replaceAll(/\s+/g, " ");
        }
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
        result.classOrigins = findClassOrigins(projectRoot, classList, filePath);
      }

    } catch (e) {
      console.warn(`[HoverSource] Failed to parse static context for ${filePath}`, e);
    }

    return result;
  }

  public resolveStaticHtmlLocation(
    projectRoot: string,
    query: StaticHtmlQuery
  ): StaticHtmlLocation | null {
    const htmlFiles = sortHtmlFiles(getAllHtmlFiles(projectRoot), projectRoot);
    if (htmlFiles.length === 0) return null;

    const normalizedTag = (query.tagName || "").toLowerCase();
    if (!normalizedTag) return null;

    let bestMatch: {
      file: string;
      line: number;
      column: number;
      score: number;
    } | null = null;

    for (const htmlFile of htmlFiles) {
      try {
        const content = fs.readFileSync(htmlFile, "utf-8");
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const tagRegex = new RegExp(String.raw`<(${normalizedTag})\b([^>]*)`, "gi");
          let match: RegExpExecArray | null;

          while ((match = tagRegex.exec(lineText)) !== null) {
            const col = match.index + 1;
            const fullTagAttrs = match[2] || "";
            let score = 10;

            // 1. Match ID if provided
            if (query.id) {
              const idRegex = new RegExp(String.raw`\bid\s*=\s*["']${escapeRegex(query.id)}["']`, "i");
              if (idRegex.test(fullTagAttrs)) {
                score += 1000;
              } else {
                continue;
              }
            }

            // 2. Match ClassList if provided
            if (query.classList && query.classList.length > 0) {
              const classMatch = /\bclass\s*=\s*["']([^"']*)["']/i.exec(fullTagAttrs);
              if (classMatch) {
                const tagClasses = classMatch[1].split(/\s+/).filter(Boolean);
                let matchingClasses = 0;
                for (const cls of query.classList) {
                  if (tagClasses.includes(cls)) {
                    matchingClasses++;
                  }
                }
                if (matchingClasses > 0) {
                  score += matchingClasses * 100;
                }
              }
            }

            // 3. Match Attributes if provided
            if (query.attributes) {
              for (const [attrKey, attrVal] of Object.entries(query.attributes)) {
                if (!attrKey || attrKey.startsWith("_")) continue;
                const attrRegex = new RegExp(String.raw`\b${escapeRegex(attrKey)}\s*=\s*["']${escapeRegex(String(attrVal))}["']`, "i");
                if (attrRegex.test(fullTagAttrs)) {
                  score += 200;
                }
              }
            }

            const relPath = path.relative(projectRoot, htmlFile).replaceAll("\\", "/");
            if (relPath.includes("index.html")) score += 20;
            if (relPath.startsWith("src/")) score += 10;

            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                file: htmlFile,
                line: i + 1,
                column: col,
                score
              };
            }
          }
        }
      } catch {}
    }

    if (!bestMatch || (bestMatch.score < 50 && !query.id)) {
      if (!bestMatch || bestMatch.score < 20) return null;
    }

    const relPath = path.relative(projectRoot, bestMatch.file).replaceAll("\\", "/");
    return {
      fileName: relPath,
      absolutePath: bestMatch.file.replaceAll("\\", "/"),
      lineNumber: bestMatch.line,
      columnNumber: bestMatch.column,
      framework: "Vanilla"
    };
  }

  public generateStaticHtmlMap(projectRoot: string): StaticHtmlEntry[] {
    const htmlFiles = sortHtmlFiles(getAllHtmlFiles(projectRoot), projectRoot);
    const map: StaticHtmlEntry[] = [];

    for (const htmlFile of htmlFiles) {
      try {
        const content = fs.readFileSync(htmlFile, "utf-8");
        const lines = content.split(/\r?\n/);
        const relFile = path.relative(projectRoot, htmlFile).replaceAll("\\", "/");

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
          let match: RegExpExecArray | null;

          while ((match = tagRegex.exec(lineText)) !== null) {
            const tagName = match[1].toLowerCase();
            if (["html", "head", "meta", "link", "title", "script", "style", "body"].includes(tagName)) continue;

            const attrsStr = match[2] || "";
            const col = match.index + 1;

            let id: string | undefined = undefined;
            const idMatch = /\bid=["']([^"']+)["']/i.exec(attrsStr);
            if (idMatch) id = idMatch[1];

            let classList: string[] = [];
            const classMatch = /\bclass=["']([^"']+)["']/i.exec(attrsStr);
            if (classMatch) {
              classList = classMatch[1].split(/\s+/).filter(Boolean);
            }

            const attributes: Record<string, string> = {};
            const attrRegex = /([a-zA-Z0-9-:]+)=["']([^"']*)["']/g;
            let aMatch: RegExpExecArray | null;
            while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
              if (aMatch[1] !== "id" && aMatch[1] !== "class") {
                attributes[aMatch[1]] = aMatch[2];
              }
            }

            map.push({
              tagName,
              id,
              classList,
              attributes,
              fileName: relFile,
              lineNumber: i + 1,
              columnNumber: col
            });
          }
        }
      } catch {}
    }

    return map;
  }
}

function getAllHtmlFiles(dir: string, fileList: string[] = []): string[] {
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
          base !== ".agents" &&
          base !== "build_output" &&
          base !== ".scratch" &&
          base !== ".devutil" &&
          base !== "coverage"
        ) {
          getAllHtmlFiles(filePath, fileList);
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        if (ext === ".html" || ext === ".htm") {
          fileList.push(filePath);
        }
      }
    }
  } catch {}
  return fileList;
}

function sortHtmlFiles(htmlFiles: string[], projectRoot: string): string[] {
  return [...htmlFiles].sort((a, b) => {
    const relA = path.relative(projectRoot, a).replaceAll("\\", "/").toLowerCase();
    const relB = path.relative(projectRoot, b).replaceAll("\\", "/").toLowerCase();
    
    const isIndexA = relA === "index.html" || relA === "src/index.html" || relA.endsWith("/index.html");
    const isIndexB = relB === "index.html" || relB === "src/index.html" || relB.endsWith("/index.html");
    if (isIndexA && !isIndexB) return -1;
    if (!isIndexA && isIndexB) return 1;

    const inSrcA = relA.startsWith("src/");
    const inSrcB = relB.startsWith("src/");
    if (inSrcA && !inSrcB) return -1;
    if (!inSrcA && inSrcB) return 1;

    return relA.localeCompare(relB);
  });
}
