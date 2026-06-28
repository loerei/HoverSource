import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PATCH_STATE_FILE = path.join(os.tmpdir(), "hoversource_patches.json");

export function recordPatchState(filePath: string, originalContent: string) {
  let state: Record<string, string> = {};
  if (fs.existsSync(PATCH_STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8"));
    } catch (err) {
      console.debug("[HoverSource] Failed to parse patch state:", err);
    }
  }
  state[filePath] = originalContent;
  try {
    fs.writeFileSync(PATCH_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.debug("[HoverSource] Failed to write patch state:", err);
  }
}

export function removePatchState(filePath: string) {
  if (!fs.existsSync(PATCH_STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8"));
    delete state[filePath];
    if (Object.keys(state).length === 0) {
      fs.unlinkSync(PATCH_STATE_FILE);
    } else {
      fs.writeFileSync(PATCH_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    }
  } catch (err) {
    console.debug("[HoverSource] Failed to remove patch state:", err);
  }
}

export function restoreLeftoverPatches() {
  if (!fs.existsSync(PATCH_STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(PATCH_STATE_FILE, "utf-8")) as Record<string, string>;
    for (const [filePath, originalContent] of Object.entries(state)) {
      try {
        fs.writeFileSync(filePath, originalContent, "utf-8");
        console.log(`[HoverSource] [Self-Healing] Restored leftover patch in ${filePath}`);
      } catch (err: any) {
        console.warn(`[HoverSource] [Self-Healing] Failed to restore leftover patch in ${filePath}:`, err.message);
      }
    }
    fs.unlinkSync(PATCH_STATE_FILE);
  } catch (err) {
    console.debug("[HoverSource] Leftover patch restore failed:", err);
  }
}
