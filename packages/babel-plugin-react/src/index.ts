import { PluginObj, types as t, transformSync, NodePath } from "@babel/core";

export default function babelPluginReactHoverSource(): PluginObj {
  return {
    name: "babel-plugin-react-hoversource",
    visitor: {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>, state: any) {
        const location = path.node.loc;
        if (!location) return;

        const filename = state.file.opts.filename;
        if (!filename) return;

        // Skip node_modules and common library files
        if (filename.includes("node_modules")) return;

        // Get project root relative path
        const projectRoot = state.file.opts.root || process.cwd();
        let relativePath = filename;
        if (filename.startsWith(projectRoot)) {
          relativePath = filename.slice(projectRoot.length).replace(/^[/\\]/, "");
        }
        // Normalize slashes to forward slashes
        relativePath = relativePath.replaceAll("\\", "/");

        const line = location.start.line;
        const column = location.start.column + 1; // 1-based column

        const locStr = `${relativePath}:${line}:${column}`;

        // Check if data-hoversource-loc attribute already exists
        const hasAttr = path.node.attributes.some(
          (attr: any) => t.isJSXAttribute(attr) && attr.name.name === "data-hoversource-loc"
        );

        if (!hasAttr) {
          path.node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier("data-hoversource-loc"),
              t.stringLiteral(locStr)
            )
          );
        }
      }
    }
  };
}

export function vitePluginReactHoverSource() {
  const pluginInstance = babelPluginReactHoverSource();
  return {
    name: "vite-plugin-react-hoversource",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (id.includes("node_modules") || !/\.[jt]sx$/.test(id)) {
        return null;
      }
      const result = transformSync(code, {
        filename: id,
        plugins: [pluginInstance],
        ast: false,
        code: true,
        sourceMaps: true,
      });
      return result ? { code: result.code || undefined, map: result.map || undefined } : null;
    }
  };
}
