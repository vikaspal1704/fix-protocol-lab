import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { loadConfig, type ServerConfig } from "../src/config.js";
import { startServer, type AppServer } from "../src/main.js";

type Msg = Record<string, unknown> & { type: string };

let app: AppServer | null = null;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const ws of clients.splice(0)) ws.terminate();
  await app?.close();
  app = null;
});

async function start(overrides: Partial<ServerConfig> = {}) {
  app = await startServer({ ...loadConfig({}), port: 0, heartbeatIntervalSec: 30, ...overrides });
  return app;
}

class Client {
  readonly messages: Msg[] = [];
  closeCode: number | null = null;
  constructor(readonly ws: WebSocket) {
    ws.on("message", (d) => this.messages.push(JSON.parse(String(d)) as Msg));
    ws.on("close", (code) => (this.closeCode = code));
    clients.push(ws);
  }
  send(payload: object) {
    this.ws.send(JSON.stringify(payload));
  }
  of(type: string) {
    return this.messages.filter((m) => m.type === type);
  }
  async until(check: (c: Client) => boolean, timeoutMs = 3000) {
    const started = Date.now();
    while (!check(this)) {
      if (Date.now() - started > timeoutMs) throw new Error(`timeout; got ${this.messages.map((m) => m.type).join(",")}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

async function connect(query = ""): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${app!.port}/ws${query}`);
  const client = new Client(ws);
  await new Promise((resolve) => ws.once("open", resolve));
  return client;
}

async function active(client: Client) {
  await client.until((c) => c.of("session.state").filter((s) => s.state === "ACTIVE").length >= 2);
}

const newOrder = { type: "order.new", symbol: "DEMO", side: "BUY", qty: 100, ordType: "LIMIT", price: "101.25" };

describe("websocket bridge", () => {
  it("bridge sends hello and session state on connect", async () => {
    await start();
    const client = await connect();

    await active(client);

    const hello = client.messages[0]!;
    expect(hello).toMatchObject({ type: "hello", buyside: "BUYSIDE", exchange: "EXCH", fixVersion: "FIX.4.4", heartBtIntSec: 30 });
    expect((hello.fixVersions as { id: string; status: string }[]).map((v) => `${v.id}:${v.status}`)).toEqual(["FIX.4.2:implemented", "FIX.4.3:implemented", "FIX.4.4:implemented", "FIX.5.0SP2:implemented"]);
    expect(client.of("session.state").map((s) => `${s.side}:${s.state}`)).toEqual(
      expect.arrayContaining(["BUYSIDE:ACTIVE", "EXCH:ACTIVE"]),
    );
  });

  it("bridge emits out and in events for each message", async () => {
    await start();
    const client = await connect();
    await active(client);

    client.send(newOrder);
    await client.until((c) => c.of("fix.message").filter((m) => m.msgType === "D").length === 2);

    const [out, inbound] = client.of("fix.message").filter((m) => m.msgType === "D");
    expect(out).toMatchObject({ from: "BUYSIDE", to: "EXCH", direction: "out", seq: 2, category: "app", msgTypeName: "NewOrderSingle", fixVersion: "FIX.4.4" });
    expect(inbound).toMatchObject({ from: "BUYSIDE", to: "EXCH", direction: "in", seq: 2 });
    expect(out!.raw).toMatch(/^8=FIX\.4\.4\|9=\d+\|35=D\|/);
    expect((out!.fields as [number, string][])[2]).toEqual([35, "D"]);
  });

  it("bridge emits order updates from execution reports", async () => {
    await start();
    const client = await connect();
    await active(client);

    client.send(newOrder);
    await client.until((c) => c.of("order.update").some((o) => o.status === "FILLED"));

    expect(client.of("order.update").map((o) => o.status)).toEqual(["PENDING_NEW", "NEW", "PARTIALLY_FILLED", "FILLED"]);
    expect(client.of("order.update").at(-1)).toMatchObject({ clOrdId: "ORD-1", cumQty: 100, leavesQty: 0, avgPx: "101.00" });
  });

  it("bridge validates client commands", async () => {
    await start();
    const client = await connect();
    await active(client);

    for (const bad of [
      { ...newOrder, qty: 0 },
      { ...newOrder, price: "1.23456" },
      { ...newOrder, symbol: "ZZZ" },
      { type: "nope" },
      { type: "fault.inject", side: "BUYSIDE", kind: "explode" },
    ]) {
      client.send(bad);
    }
    client.ws.send("not json");
    await client.until((c) => c.of("error").length === 6);

    expect(new Set(client.of("error").map((e) => e.code))).toEqual(new Set(["BAD_REQUEST"]));
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("bridge rate limits order commands", async () => {
    await start({ orderRateLimitPerSec: 5 });
    const client = await connect();
    await active(client);

    for (let i = 0; i < 6; i++) client.send(newOrder);
    await client.until((c) => c.of("error").length === 1);

    expect(client.of("error")[0]).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("bridge enforces sandbox capacity", async () => {
    await start({ maxSandboxes: 1 });
    const first = await connect();
    await active(first);

    const second = await connect();
    await second.until((c) => c.closeCode !== null);

    expect(second.of("error")[0]).toMatchObject({ code: "CAPACITY" });
    expect(second.closeCode).toBe(1013);
  });

  it("bridge rejects unsupported fix version", async () => {
    await start();

    const client = await connect("?fixVersion=FIX.4.1");
    await client.until((c) => c.closeCode !== null);

    expect(client.of("error")[0]).toMatchObject({ code: "UNSUPPORTED_VERSION" });
    expect(client.closeCode).toBe(1008);
  });

  for (const [version, beginString] of [["FIX.4.2", "FIX.4.2"], ["FIX.4.3", "FIX.4.3"], ["FIX.5.0SP2", "FIXT.1.1"]]) {
    it(`bridge trades over a ${version} session`, async () => {
      await start();
      const client = await connect(`?fixVersion=${version}`);
      await active(client);

      client.send(newOrder);
      await client.until((c) => c.of("order.update").some((o) => o.status === "FILLED"));

      expect(client.messages[0]).toMatchObject({ type: "hello", fixVersion: version });
      const fix = client.of("fix.message");
      expect(fix.every((m) => String(m.raw).startsWith(`8=${beginString}|`) && m.fixVersion === version)).toBe(true);
      expect(client.of("order.update").map((o) => o.status)).toEqual(["PENDING_NEW", "NEW", "PARTIALLY_FILLED", "FILLED"]);
    });
  }

  it("sandboxes are isolated", async () => {
    await start();
    const a = await connect();
    const b = await connect();
    await Promise.all([active(a), active(b)]);

    a.send(newOrder);
    await a.until((c) => c.of("order.update").some((o) => o.status === "FILLED"));
    await new Promise((r) => setTimeout(r, 50));

    expect(b.of("order.update")).toEqual([]);
    expect(b.of("fix.message").some((m) => m.msgType === "D")).toBe(false);
    expect(app!.sandboxes.size).toBe(2);
  });

  it("sandbox closes after idle timeout", async () => {
    await start({ sandboxIdleTimeoutSec: 1 });
    const client = await connect();
    await active(client);

    await client.until((c) => c.closeCode !== null, 3000);

    expect(client.closeCode).toBe(1000);
    await new Promise((r) => setTimeout(r, 50));
    expect(app!.sandboxes.size).toBe(0);
  });

  it("gap recovery scenario over websocket", async () => {
    await start();
    const client = await connect();
    await active(client);

    client.send({ type: "fault.inject", side: "BUYSIDE", kind: "drop_next" });
    client.send(newOrder);
    client.send({ ...newOrder, side: "SELL", price: "105.00" });
    await client.until((c) => c.of("order.update").filter((o) => o.status === "NEW").length === 2);

    const types = client.of("fix.message").filter((m) => m.direction === "out").map((m) => `${m.msgType}${m.dropped ? "✕" : ""}${m.possDup ? "*" : ""}`);
    expect(types).toEqual(expect.arrayContaining(["D✕", "2", "D*"]));
    expect(client.of("fault.applied")).toHaveLength(1);
    await client.until((c) => c.of("session.state").at(-1)?.state === "ACTIVE");
  });

  it("logon restarts sessions after logout", async () => {
    await start();
    const client = await connect();
    await active(client);

    client.send({ type: "session.logout", side: "BUYSIDE" });
    await client.until((c) => c.of("session.state").filter((s) => s.state === "DISCONNECTED").length >= 2);
    client.send({ type: "session.logon" });
    await client.until((c) => c.of("session.state").filter((s) => s.state === "ACTIVE").length >= 4);

    client.send(newOrder);
    await client.until((c) => c.of("order.update").some((o) => o.status === "NEW"));
  });
});

describe("http", () => {
  it("health reports status and sandbox count", async () => {
    await start();
    const res = await fetch(`http://127.0.0.1:${app!.port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", version: "0.1.0", sandboxes: 0 });
  });

  it("instruments endpoint lists symbols", async () => {
    await start();

    const body = await (await fetch(`http://127.0.0.1:${app!.port}/api/instruments`)).json();

    expect(body).toEqual([{ symbol: "DEMO", refPx: "101.00" }, { symbol: "ACME", refPx: "50.00" }]);
  });

  it("versions endpoint lists registry", async () => {
    await start();

    const body = (await (await fetch(`http://127.0.0.1:${app!.port}/api/versions`)).json()) as { id: string; status: string }[];

    expect(body.map((v) => `${v.id}:${v.status}`)).toEqual(["FIX.4.2:implemented", "FIX.4.3:implemented", "FIX.4.4:implemented", "FIX.5.0SP2:implemented"]);
  });

  it("serves built ui with spa fallback", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dist = mkdtempSync(join(tmpdir(), "fixlab-web-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>FIX Protocol Lab</title>");
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");
    await start({ webDist: dist });
    const base = `http://127.0.0.1:${app!.port}`;

    const deep = await fetch(`${base}/some/route`);
    const asset = await fetch(`${base}/assets/app.js`);
    const missing = await fetch(`${base}/assets/missing.js`);
    const escape = await fetch(`${base}/..%2f..%2fetc/passwd`);

    expect(await deep.text()).toContain("FIX Protocol Lab");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(missing.status).toBe(404);
    // Traversal never leaves the dist folder: it falls back to the SPA shell.
    expect(await escape.text()).toContain("FIX Protocol Lab");
  });
});
