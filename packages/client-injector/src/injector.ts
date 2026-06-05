import http from "node:http";
import WebSocket from "ws";

interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch JSON, status code: ${res.statusCode}`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function injectIntoTarget(wsUrl: string, scriptContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageId = 1;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        id: messageId++,
        method: "Runtime.enable",
        params: {}
      }));

      ws.send(JSON.stringify({
        id: messageId++,
        method: "Runtime.evaluate",
        params: {
          expression: scriptContent,
          userGesture: true,
          awaitPromise: false
        }
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 2) {
          if (msg.error) {
            reject(new Error(`CDP evaluation error: ${JSON.stringify(msg.error)}`));
          } else if (msg.result?.exceptionDetails) {
            reject(new Error(`Script execution threw exception: ${msg.result.exceptionDetails.exception.description}`));
          } else {
            resolve();
          }
          ws.close();
        }
      } catch (e) {
        reject(e);
        ws.close();
      }
    });

    ws.on("error", (err) => {
      reject(err);
    });
  });
}

export async function injectOverlayScript(port: number, scriptContent: string): Promise<number> {
  const listUrl = `http://127.0.0.1:${port}/json`;
  const targets = await fetchJson<CdpTarget[]>(listUrl);
  
  const validTargets = targets.filter(
    (t) => t.type === "page" || t.type === "webview" || t.type === "background_page" || t.url.startsWith("http") || t.url.startsWith("file")
  );

  if (validTargets.length === 0) {
    throw new Error(`No injectable targets found at ${listUrl}`);
  }

  let injectionCount = 0;
  for (const target of validTargets) {
    if (target.webSocketDebuggerUrl) {
      try {
        await injectIntoTarget(target.webSocketDebuggerUrl, scriptContent);
        console.log(`[HoverSource] Injected overlay successfully into: ${target.title} (${target.url})`);
        injectionCount++;
      } catch (err) {
        console.error(`[HoverSource] Failed to inject into target ${target.title}:`, err);
      }
    }
  }

  return injectionCount;
}

export async function broadcastToTargets(port: number, scriptContent: string): Promise<void> {
  try {
    const listUrl = `http://127.0.0.1:${port}/json`;
    const targets = await fetchJson<CdpTarget[]>(listUrl);
    const validTargets = targets.filter(
      (t) => t.type === "page" || t.type === "webview" || t.type === "background_page" || t.url.startsWith("http") || t.url.startsWith("file")
    );

    for (const target of validTargets) {
      if (target.webSocketDebuggerUrl) {
        // Fire-and-forget JS evaluation in target
        try {
          const ws = new WebSocket(target.webSocketDebuggerUrl);
          ws.on("open", () => {
            ws.send(JSON.stringify({
              id: 1,
              method: "Runtime.evaluate",
              params: {
                expression: scriptContent,
                userGesture: false,
                awaitPromise: false
              }
            }));
            // Close after short delay to let message send
            setTimeout(() => ws.close(), 100);
          });
          ws.on("error", () => {}); // ignore errors silently
        } catch (e) {
          // ignore target connections errors
        }
      }
    }
  } catch (err) {
    // ignore fetch JSON errors if port closed
  }
}
