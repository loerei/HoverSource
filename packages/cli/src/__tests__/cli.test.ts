import { describe, it, expect } from "vitest";
import net from "net";
import { isPortFree, findFreePort, resolveCompanionPort } from "../cli.js";

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
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(0, "127.0.0.1", () => resolve());
    });
    const occupiedPort = (tempServer.address() as net.AddressInfo).port;

    try {
      const nextFree = await findFreePort(occupiedPort);
      // Since occupiedPort is occupied, findFreePort should find the next port (or another free port)
      expect(nextFree).not.toBe(occupiedPort);
      const free = await isPortFree(nextFree);
      expect(free).toBe(true);
    } finally {
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));
    }
  });

  it("should exclude specific ports when finding free port", async () => {
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(0, "127.0.0.1", () => resolve());
    });
    const freePort = (tempServer.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const nextFree = await findFreePort(freePort, freePort);
    expect(nextFree).not.toBe(freePort);
    const free = await isPortFree(nextFree);
    expect(free).toBe(true);
  });

  it("should resolve companion port collision with target application port", async () => {
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => {
      tempServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (tempServer.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const resolved = await resolveCompanionPort(port, port);
    // Should shift companion port and not equal to targetPort
    expect(resolved).not.toBe(port);
  });
});
