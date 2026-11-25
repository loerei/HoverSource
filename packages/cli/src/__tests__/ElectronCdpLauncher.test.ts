import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createElectronCdpCleanup } from "../launcher/ElectronCdpLauncher.js";

describe("createElectronCdpCleanup", () => {
  it("invokes watchAbort.abort(), closeSessions(), and exit() once on SIGINT and detaches listeners", () => {
    const processEvents = new EventEmitter();
    const child = new EventEmitter();
    const watchAbort = new AbortController();
    const closeSessions = vi.fn();
    const exit = vi.fn();

    createElectronCdpCleanup({
      watchAbort,
      closeSessions,
      exit,
      processEvents,
      child,
    });

    expect(processEvents.listenerCount("SIGINT")).toBe(1);
    expect(processEvents.listenerCount("SIGTERM")).toBe(1);
    expect(child.listenerCount("exit")).toBe(1);

    processEvents.emit("SIGINT");
    processEvents.emit("SIGTERM");
    child.emit("exit", 0);

    expect(watchAbort.signal.aborted).toBe(true);
    expect(closeSessions).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(processEvents.listenerCount("SIGINT")).toBe(0);
    expect(processEvents.listenerCount("SIGTERM")).toBe(0);
    expect(child.listenerCount("exit")).toBe(0);
  });

  it("triggers cleanup idempotently on SIGTERM or child exit", () => {
    const processEvents = new EventEmitter();
    const child = new EventEmitter();
    const watchAbort = new AbortController();
    const closeSessions = vi.fn();
    const exit = vi.fn();

    createElectronCdpCleanup({
      watchAbort,
      closeSessions,
      exit,
      processEvents,
      child,
    });

    child.emit("exit", 1);
    processEvents.emit("SIGTERM");

    expect(watchAbort.signal.aborted).toBe(true);
    expect(closeSessions).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(processEvents.listenerCount("SIGINT")).toBe(0);
    expect(processEvents.listenerCount("SIGTERM")).toBe(0);
    expect(child.listenerCount("exit")).toBe(0);
  });
});
