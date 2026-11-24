import http from "node:http";
import { exec } from "node:child_process";
import { startCompanionServer } from "@hoversource/companion-server";
import { resolveCompanionPort } from "../port.js";

export interface DashboardCommandOptions {
  requestedPort: number;
  projectRoot: string;
  debugPort: number;
  json?: boolean;
  noOpen?: boolean;
  pingTimeoutMs?: number;
  openBrowserFn?: (url: string) => void;
  resolveCompanionPortFn?: (port: number) => Promise<number>;
  startCompanionServerFn?: typeof startCompanionServer;
}

export interface DashboardCommandResult {
  exitCode: number;
  keepAlive: boolean;
  close?: () => Promise<void>;
}

function defaultOpenBrowser(url: string): void {
  let startCmd = "xdg-open";
  if (process.platform === "darwin") {
    startCmd = "open";
  } else if (process.platform === "win32") {
    startCmd = "start";
  }
  const command = process.platform === "win32" ? `start "" "${url}"` : `${startCmd} "${url}"`;
  exec(command, (err) => {
    if (err) {
      console.error(`[HoverSource] Failed to automatically open dashboard in browser: ${err.message}`);
    }
  });
}

function httpGetText(url: string, timeoutMs: number): Promise<{ statusCode: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

function waitForListening(server: http.Server): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

export async function runDashboardCommand(
  opts: DashboardCommandOptions
): Promise<DashboardCommandResult> {
  const timeoutMs = opts.pingTimeoutMs ?? 800;
  const openBrowserFn = opts.openBrowserFn ?? defaultOpenBrowser;
  const resolvePortFn = opts.resolveCompanionPortFn ?? resolveCompanionPort;
  const startServerFn = opts.startCompanionServerFn ?? startCompanionServer;

  const baseUrl = `http://127.0.0.1:${opts.requestedPort}`;
  const pingResult = await httpGetText(`${baseUrl}/ping`, timeoutMs);

  if (pingResult && pingResult.statusCode === 200 && pingResult.body.trim() === "pong") {
    const dashboardUrl = `${baseUrl}/dashboard`;

    if (!opts.noOpen) {
      const openRes = await httpGetText(`${baseUrl}/open-dashboard`, timeoutMs);
      if (!openRes || openRes.statusCode >= 400) {
        openBrowserFn(dashboardUrl);
      }
    }

    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({ status: "running", port: opts.requestedPort, url: dashboardUrl })}\n`
      );
    } else {
      console.log(`[HoverSource] Dashboard opened at ${dashboardUrl}`);
    }

    return { exitCode: 0, keepAlive: false };
  }

  const serverPort = await resolvePortFn(opts.requestedPort);
  const server = startServerFn({
    port: serverPort,
    projectRoot: opts.projectRoot,
    debugPort: opts.debugPort,
  });

  await waitForListening(server);

  const dashboardUrl = `http://127.0.0.1:${serverPort}/dashboard`;
  if (!opts.noOpen) {
    openBrowserFn(dashboardUrl);
  }

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ status: "started", port: serverPort, url: dashboardUrl })}\n`
    );
  } else {
    console.log(`[HoverSource] Companion server running on port ${serverPort}.`);
    console.log(`[HoverSource] Dashboard opened at ${dashboardUrl}`);
  }

  let closed = false;
  const closeServer = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  const onSignal = () => {
    void closeServer().then(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  return {
    exitCode: 0,
    keepAlive: true,
    close: closeServer,
  };
}
