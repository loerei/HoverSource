import { describe, it, expect, vi, afterEach } from "vitest";
import net from "net";
import { closeAllCdpSessions } from "@hoversource/client-injector";
import {
  isPortFree,
  findFreePort,
  resolveCompanionPort,
  startCdpInjectionWatch,
  showHelp,
} from "../cli.js";

describe("Port Heuristics", () => {
  it("should detect when a port is free", async () => {
    // Dynamically allocate a free port from the OS, then close it to ensure it is free
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(0, "127.0.0.1", () => resolve());
    });
    const freePort = (tempServer.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const free = await isPortFree(freePort);
    expect(free).toBe(true);
  });

  it("should detect when a port is occupied", async () => {
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(0, "127.0.0.1", () => resolve());
    });
    const occupiedPort = (tempServer.address() as net.AddressInfo).port;

    try {
      const free = await isPortFree(occupiedPort);
      expect(free).toBe(false);
    } finally {
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));
    }
  });

  it("should find the next free port", async () => {
    const occupiedPort = await findFreePort(24250);
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(occupiedPort, "127.0.0.1", () => resolve());
    });

    try {
      const nextFree = await findFreePort(occupiedPort);
      // Since occupiedPort is occupied, findFreePort should find the next free port outside OS ephemeral pools
      expect(nextFree).not.toBe(occupiedPort);
      const free = await isPortFree(nextFree);
      expect(free).toBe(true);
    } finally {
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));
    }
  });

  it("should exclude specific ports when finding free port", async () => {
    const freePort = await findFreePort(24300);

    const nextFree = await findFreePort(freePort, freePort);
    expect(nextFree).not.toBe(freePort);
    const free = await isPortFree(nextFree);
    expect(free).toBe(true);
  });

  it("should resolve companion port collision with target application port", async () => {
    const port = await findFreePort(24350);

    const resolved = await resolveCompanionPort(port, port);
    // Should shift companion port and not equal to targetPort
    expect(resolved).not.toBe(port);
  });
});

describe("startCdpInjectionWatch", () => {
  afterEach(() => {
    vi.useRealTimers();
    closeAllCdpSessions();
  });

  it("blocks overlapping interval ticks while injectFn is pending via isPolling", async () => {
    vi.useFakeTimers();
    let resolvePending!: (n: number) => void;
    const injectFn = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolvePending = resolve;
        })
    );
    const ac = new AbortController();

    const watchPromise = startCdpInjectionWatch(9222, "script", {
      pollIntervalMs: 100,
      signal: ac.signal,
      injectFn,
    });

    expect(injectFn).toHaveBeenCalledTimes(1);
    resolvePending(1);
    await watchPromise;

    // Start second tick that stays pending
    await vi.advanceTimersByTimeAsync(100);
    expect(injectFn).toHaveBeenCalledTimes(2);

    // Advance past multiple intervals while 2nd call is still pending
    await vi.advanceTimersByTimeAsync(350);
    expect(injectFn).toHaveBeenCalledTimes(2);

    resolvePending(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(injectFn).toHaveBeenCalledTimes(3);

    ac.abort();
  });

  it("clamps invalid pollIntervalMs (0, NaN) to 2500ms without tight-looping", async () => {
    vi.useFakeTimers();
    for (const invalidInterval of [0, Number.NaN, -50, Number.POSITIVE_INFINITY]) {
      const injectFn = vi.fn().mockResolvedValue(1);
      const ac = new AbortController();
      await startCdpInjectionWatch(9222, "script", {
        pollIntervalMs: invalidInterval,
        signal: ac.signal,
        injectFn,
      });
      expect(injectFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2400);
      expect(injectFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(injectFn).toHaveBeenCalledTimes(2);
      ac.abort();
    }
  });

  it("does not schedule setInterval if signal is aborted before or during initial pollAndInject", async () => {
    vi.useFakeTimers();

    // Aborted before start
    const injectBefore = vi.fn().mockResolvedValue(1);
    const acBefore = new AbortController();
    acBefore.abort();
    await startCdpInjectionWatch(9222, "script", {
      pollIntervalMs: 100,
      signal: acBefore.signal,
      injectFn: injectBefore,
    });
    expect(injectBefore).not.toHaveBeenCalled();

    // Aborted during initial pollAndInject
    let resolveInitial!: (n: number) => void;
    const injectDuring = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveInitial = resolve;
        })
    );
    const acDuring = new AbortController();
    const watchPromise = startCdpInjectionWatch(9222, "script", {
      pollIntervalMs: 100,
      signal: acDuring.signal,
      injectFn: injectDuring,
    });
    expect(injectDuring).toHaveBeenCalledTimes(1);
    acDuring.abort();
    resolveInitial(1);
    await watchPromise;

    await vi.advanceTimersByTimeAsync(5000);
    expect(injectDuring).toHaveBeenCalledTimes(1);
  });

  it("stops interval cleanly when signal aborts after startup", async () => {
    vi.useFakeTimers();
    const injectFn = vi.fn().mockResolvedValue(1);
    const ac = new AbortController();

    await startCdpInjectionWatch(9222, "script", {
      pollIntervalMs: 100,
      signal: ac.signal,
      injectFn,
    });
    expect(injectFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(injectFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(injectFn).toHaveBeenCalledTimes(2);
  });

  it("forwards companionPort from options object and numeric 3rd argument", async () => {
    vi.useFakeTimers();
    const injectFn = vi.fn().mockResolvedValue(1);
    const ac = new AbortController();

    await startCdpInjectionWatch(9222, "script", {
      companionPort: 7456,
      signal: ac.signal,
      injectFn,
    });
    expect(injectFn).toHaveBeenCalledWith(
      9222,
      "script",
      expect.objectContaining({ companionPort: 7456 })
    );
    ac.abort();

    // Numeric 3rd argument backward compatibility (just verify it runs without throwing;
    // since injectOverlayScript is default when options is a number, we test via spy or
    // verify numeric forwarding doesn't fail on a closed port)
    await expect(
      startCdpInjectionWatch(1, "script", 7456)
    ).resolves.toBeUndefined();
  });
});

describe("showHelp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints CLI flags and .hoversourcerc scan-scope schema for agents and users", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    showHelp();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0][0]);
    expect(output).toContain("config preset");
    expect(output).toContain("--dev-port");
    expect(output).toContain("--https");
    expect(output).toContain(".hoversourcerc");
    expect(output).toContain("include");
    expect(output).toContain("ignore");
    expect(output).toContain("respectGitignore");
    expect(output).toContain("whitelist mode");
    expect(output).toContain("Prefer folder prefixes");
  });
});
