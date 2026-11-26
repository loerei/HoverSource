import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_LATEST_URL = "https://registry.npmjs.org/hoversource/latest";

export interface UpdateCacheEntry {
  checkedAt: number;
  latestVersion: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  notice: string;
}

export interface CheckForUpdateOptions {
  currentVersion: string;
  json?: boolean;
  quiet?: boolean;
  cachePath?: string;
  nowMs?: number;
  forceCheck?: boolean;
  fetchFn?: typeof fetch;
}

export interface RunUpdateCommandOptions {
  currentVersion: string;
  dryRun?: boolean;
  json?: boolean;
  fetchFn?: typeof fetch;
  execInstallFn?: () => { status: number | null; stderr?: string };
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = raw.trim().replace(/^v/i, "").split("+")[0];
  const dashIdx = cleaned.indexOf("-");
  const core = dashIdx === -1 ? cleaned : cleaned.slice(0, dashIdx);
  const prerelease = dashIdx === -1 ? "" : cleaned.slice(dashIdx + 1);
  const parts = core.split(".");
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return {
    major: nums[0],
    minor: nums[1],
    patch: nums[2],
    prerelease,
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === "") return 1;
  if (pb.prerelease === "") return -1;
  return pa.prerelease > pb.prerelease ? 1 : -1;
}

export function formatUpdateNotice(currentVersion: string, latestVersion: string): string {
  return `[HoverSource] Update available: ${currentVersion} -> ${latestVersion}. Run "hs update" or "npm install -g hoversource@latest".`;
}

export function getDefaultUpdateCachePath(cachePath?: string): string {
  return cachePath ?? path.join(os.homedir(), ".hoversource-update-cache.json");
}

function readUpdateCache(cachePath: string): UpdateCacheEntry | null {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Partial<UpdateCacheEntry>;
    if (
      typeof raw.checkedAt === "number" &&
      Number.isFinite(raw.checkedAt) &&
      typeof raw.latestVersion === "string" &&
      raw.latestVersion.trim() !== ""
    ) {
      return { checkedAt: raw.checkedAt, latestVersion: raw.latestVersion.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

function writeUpdateCache(cachePath: string, entry: UpdateCacheEntry): void {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), "utf-8");
  } catch {
    // Cache writes are best-effort
  }
}

export async function fetchLatestCliVersion(
  timeoutMs: number,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(REGISTRY_LATEST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" && data.version.trim() !== ""
      ? data.version.trim()
      : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(
  opts: CheckForUpdateOptions
): Promise<UpdateCheckResult | null> {
  if (!opts.forceCheck) {
    if (
      opts.json ||
      opts.quiet ||
      process.env.CI === "true" ||
      process.env.NO_UPDATE_NOTIFIER === "1" ||
      process.env.NODE_ENV === "test"
    ) {
      return null;
    }
  }

  const cachePath = getDefaultUpdateCachePath(opts.cachePath);
  const now = opts.nowMs ?? Date.now();
  const cached = readUpdateCache(cachePath);

  let latestVersion: string | null = null;
  const cacheAge = cached ? now - cached.checkedAt : -1;
  if (cached && cacheAge >= 0 && cacheAge < UPDATE_CACHE_TTL_MS) {
    latestVersion = cached.latestVersion;
  } else {
    latestVersion = await fetchLatestCliVersion(800, opts.fetchFn);
    if (latestVersion) {
      writeUpdateCache(cachePath, { checkedAt: now, latestVersion });
    }
  }

  if (!latestVersion) return null;
  if (compareSemver(latestVersion, opts.currentVersion) <= 0) {
    return null;
  }

  return {
    currentVersion: opts.currentVersion,
    latestVersion,
    notice: formatUpdateNotice(opts.currentVersion, latestVersion),
  };
}

function defaultExecGlobalInstall(json: boolean): { status: number | null; stderr?: string } {
  const result = spawnSync("npm", ["install", "-g", "hoversource@latest"], {
    stdio: json ? "pipe" : "inherit",
    shell: process.platform === "win32",
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stderr: typeof result.stderr === "string" ? result.stderr : undefined,
  };
}

export async function runUpdateCommand(opts: RunUpdateCommandOptions): Promise<number> {
  const isJson = Boolean(opts.json);
  const latestVersion = await fetchLatestCliVersion(5000, opts.fetchFn);

  if (!latestVersion) {
    if (isJson) {
      process.stdout.write(
        `${JSON.stringify({ updated: false, error: "Failed to reach npm registry for hoversource@latest" })}\n`
      );
    } else {
      console.error("[HoverSource] Failed to check latest version on npm registry.");
    }
    return 1;
  }

  if (compareSemver(latestVersion, opts.currentVersion) <= 0) {
    if (isJson) {
      process.stdout.write(
        `${JSON.stringify({
          updated: false,
          upToDate: true,
          currentVersion: opts.currentVersion,
          latestVersion,
        })}\n`
      );
    } else {
      console.log(`[HoverSource] Already on the latest version (${opts.currentVersion}).`);
    }
    return 0;
  }

  if (opts.dryRun) {
    if (isJson) {
      process.stdout.write(
        `${JSON.stringify({
          dryRun: true,
          currentVersion: opts.currentVersion,
          latestVersion,
          command: "npm install -g hoversource@latest",
        })}\n`
      );
    } else {
      console.log(
        `[HoverSource] Dry run: would update hoversource ${opts.currentVersion} -> ${latestVersion} via "npm install -g hoversource@latest".`
      );
    }
    return 0;
  }

  const installFn = opts.execInstallFn ?? (() => defaultExecGlobalInstall(isJson));
  const installRes = installFn();
  if (installRes.status !== 0) {
    if (isJson) {
      process.stdout.write(
        `${JSON.stringify({
          updated: false,
          currentVersion: opts.currentVersion,
          latestVersion,
          error: installRes.stderr?.trim() || "npm install exited with non-zero status",
        })}\n`
      );
    } else {
      console.error("[HoverSource] Update failed. Try running: npm install -g hoversource@latest");
    }
    return 1;
  }

  if (isJson) {
    process.stdout.write(
      `${JSON.stringify({
        updated: true,
        currentVersion: opts.currentVersion,
        latestVersion,
      })}\n`
    );
  } else {
    console.log(`[HoverSource] Updated hoversource to ${latestVersion}.`);
  }
  return 0;
}
