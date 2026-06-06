import esbuild from "esbuild";

try {
  await esbuild.build({
    entryPoints: ["src/overlay.ts"],
    bundle: true,
    outfile: "dist/overlay.bundle.js",
    format: "iife",
    platform: "browser",
    minify: false, // Keep it readable for debugging in dev
    sourcemap: false
  });
} catch (e) {
  console.error("Esbuild build failed", e);
  process.exit(1);
}
