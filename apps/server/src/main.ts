import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { listVersions } from "@fixlab/fix-core";
import { WebSocketServer } from "ws";

import { APP_VERSION, handleConnection, type BridgeContext } from "./bridge.js";
import { INSTRUMENTS, loadConfig, type ServerConfig } from "./config.js";
import type { Sandbox } from "./sandbox.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}

export interface AppServer {
  readonly server: Server;
  readonly port: number;
  readonly sandboxes: Set<Sandbox>;
  close(): Promise<void>;
}

export async function startServer(config: ServerConfig): Promise<AppServer> {
  const startedAt = Date.now();
  const sandboxes = new Set<Sandbox>();
  const ctx: BridgeContext = { config, sandboxes };
  const webDist =
    config.webDist ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const file = normalize(join(webDist, path));
    const inside = file.startsWith(webDist + sep);
    if (inside && existsSync(file) && statSync(file).isFile()) {
      const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
      const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      res.writeHead(200, { "content-type": type, "cache-control": cache });
      createReadStream(file).pipe(res);
      return;
    }
    const index = join(webDist, "index.html");
    if (!extname(path) && existsSync(index)) {
      res.writeHead(200, { "content-type": CONTENT_TYPES[".html"]!, "cache-control": "no-cache" });
      createReadStream(index).pipe(res); // SPA fallback
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(existsSync(index) ? "not found" : "UI not built: run npm run build");
  };

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { detail: "method not allowed" });
    if (path === "/health") {
      return json(res, 200, {
        status: "ok",
        version: APP_VERSION,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        sandboxes: sandboxes.size,
      });
    }
    if (path === "/api/instruments") return json(res, 200, INSTRUMENTS);
    if (path === "/api/versions") {
      return json(
        res,
        200,
        listVersions().map(({ id, label, beginString, status, summary }) => ({ id, label, beginString, status, summary })),
      );
    }
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (config.publicOrigin && req.headers.origin !== config.publicOrigin) {
        ws.close(1008, "origin not allowed");
        return;
      }
      log("sandbox.open", { sandboxes: sandboxes.size + 1 });
      ws.on("close", (code) => log("sandbox.close", { code, sandboxes: sandboxes.size }));
      handleConnection(ws, req.url, ctx);
    });
  });

  await new Promise<void>((resolveListen) => server.listen(config.port, resolveListen));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  log("server.start", { port, maxSandboxes: config.maxSandboxes });

  return {
    server,
    port,
    sandboxes,
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      await Promise.all([...sandboxes].map((s) => s.close()));
      await new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      });
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startServer(loadConfig());
  const shutdown = () => void app.close().then(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
