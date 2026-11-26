import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { compareSemver, checkForUpdate, runUpdateCommand } from "../update.js";

describe("compareSemver", () => {
  it("compares major, minor, patch, and prerelease tags", () => {
    expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.1.0", "1.1.0-rc.1")).toBe(1);
    expect(compareSemver("v2.0.0", "1.9.9")).toBe(1);
  });
});

describe("checkForUpdate", () => {
  let tmpDir: string;
  let cachePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hs-update-test-"));
    cachePath = path.join(tmpDir, "update-cache.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NO_UPDATE_NOTIFIER;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fetches latest version once, caches for 24h, and returns formatted notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.2.0" }),
    } as Response);

    const first = await checkForUpdate({
      currentVersion: "1.0.0",
      cachePath,
      nowMs: 1_000_000,
      forceCheck: true,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(first?.latestVersion).toBe("1.2.0");
    expect(first?.notice).toContain("1.0.0 -> 1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second check within 24h uses cache with 0 network calls
    const second = await checkForUpdate({
      currentVersion: "1.0.0",
      cachePath,
      nowMs: 1_000_000 + 60_000,
      forceCheck: true,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(second?.latestVersion).toBe("1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses update checks when --json, --quiet, or NO_UPDATE_NOTIFIER=1 is set", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const fetchMock = vi.fn();
    try {
      expect(
        await checkForUpdate({
          currentVersion: "1.0.0",
          json: true,
          cachePath,
          fetchFn: fetchMock as unknown as typeof fetch,
        })
      ).toBeNull();
      expect(
        await checkForUpdate({
          currentVersion: "1.0.0",
          quiet: true,
          cachePath,
          fetchFn: fetchMock as unknown as typeof fetch,
        })
      ).toBeNull();
      process.env.NO_UPDATE_NOTIFIER = "1";
      expect(
        await checkForUpdate({
          currentVersion: "1.0.0",
          cachePath,
          fetchFn: fetchMock as unknown as typeof fetch,
        })
      ).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (prevNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prevNodeEnv;
      }
    }
  });
});

describe("runUpdateCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports up-to-date and --dry-run JSON cleanly", async () => {
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const upToDateFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    } as Response);
    expect(
      await runUpdateCommand({
        currentVersion: "1.0.0",
        json: true,
        fetchFn: upToDateFetch as unknown as typeof fetch,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim())).toEqual({
      updated: false,
      upToDate: true,
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
    });

    stdout.length = 0;
    const newerFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.3.0" }),
    } as Response);
    const execMock = vi.fn();
    expect(
      await runUpdateCommand({
        currentVersion: "1.0.0",
        dryRun: true,
        json: true,
        fetchFn: newerFetch as unknown as typeof fetch,
        execInstallFn: execMock,
      })
    ).toBe(0);
    expect(execMock).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.join("").trim())).toEqual({
      dryRun: true,
      currentVersion: "1.0.0",
      latestVersion: "1.3.0",
      command: "npm install -g hoversource@latest",
    });
  });

  it("invokes installer when newer version exists and handles failure", async () => {
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const newerFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.4.0" }),
    } as Response);

    expect(
      await runUpdateCommand({
        currentVersion: "1.0.0",
        json: true,
        fetchFn: newerFetch as unknown as typeof fetch,
        execInstallFn: () => ({ status: 0 }),
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim())).toEqual({
      updated: true,
      currentVersion: "1.0.0",
      latestVersion: "1.4.0",
    });

    stdout.length = 0;
    expect(
      await runUpdateCommand({
        currentVersion: "1.0.0",
        json: true,
        fetchFn: newerFetch as unknown as typeof fetch,
        execInstallFn: () => ({ status: 1, stderr: "EACCES" }),
      })
    ).toBe(1);
    expect(JSON.parse(stdout.join("").trim()).updated).toBe(false);
  });
});
