import { randomBytes } from "node:crypto";

import {
  DEFAULT_VERSION_ID,
  getImplementedVersion,
  isImplemented,
  listVersions,
  toDisplay,
  versionForBeginString,
  type ImplementedProfile,
} from "@fixlab/fix-core";
import type { FaultKind, WireEvent } from "@fixlab/fix-session";
import type { WebSocket } from "ws";

import { INSTRUMENTS, type ServerConfig } from "./config.js";
import { hasDialect } from "./dialects/index.js";
import { BUYSIDE, EXCH, Sandbox, SandboxError, type BlotterEntry, type SandboxEvent, type Side } from "./sandbox.js";

export const APP_VERSION = "0.1.0";
const SLOW_CONSUMER_BYTES = 1024 * 1024;
const PRICE = /^\d{1,7}(\.\d{1,4})?$/;
const FAULTS: readonly FaultKind[] = ["drop_next", "pause_heartbeats", "corrupt_next_checksum"];

export interface BridgeContext {
  readonly config: ServerConfig;
  readonly sandboxes: Set<Sandbox>;
}

type ErrorCode =
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "CAPACITY"
  | "SESSION_NOT_ACTIVE"
  | "UNKNOWN_ORDER"
  | "UNSUPPORTED_VERSION"
  | "INTERNAL";

class BadRequest extends Error {}

/** Pick the FIX version requested in `?fixVersion=` (API_CONTRACT §5). */
function requestedVersion(url: string | undefined): ImplementedProfile | string {
  const id = new URL(url ?? "/", "http://localhost").searchParams.get("fixVersion") ?? DEFAULT_VERSION_ID;
  const profile = listVersions().find((v) => v.id === id);
  if (!profile) return `FIX version ${id} is not known`;
  if (!isImplemented(profile) || !hasDialect(profile.id)) return `${profile.label} is planned, not implemented yet`;
  return getImplementedVersion(profile.id);
}

/** Split raw FIX display text into [tag, value] pairs, even for garbled messages. */
function splitFields(display: string): [number, string][] {
  return display
    .split("|")
    .filter(Boolean)
    .map((f) => {
      const i = f.indexOf("=");
      return [Number(f.slice(0, i)), f.slice(i + 1)] as [number, string];
    });
}

export function handleConnection(ws: WebSocket, url: string | undefined, ctx: BridgeContext): void {
  const send = (payload: object) => {
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > SLOW_CONSUMER_BYTES) {
      ws.close(1013, "slow consumer");
      return;
    }
    ws.send(JSON.stringify(payload));
  };
  const error = (code: ErrorCode, message: string) => send({ type: "error", code, message });

  const version = requestedVersion(url);
  if (typeof version === "string") {
    error("UNSUPPORTED_VERSION", version);
    ws.close(1008, "unsupported FIX version");
    return;
  }
  if (ctx.sandboxes.size >= ctx.config.maxSandboxes) {
    error("CAPACITY", "The demo is full right now; please try again in a minute.");
    ws.close(1013, "capacity");
    return;
  }

  let messageId = 0;
  const onEvent = (event: SandboxEvent) => {
    if (event.type === "wire") send(wireJson(event.side, event.wire, version, ++messageId));
    else if (event.type === "state") {
      const session = event.side === BUYSIDE ? sandbox.buy : sandbox.exch;
      send({
        type: "session.state",
        side: event.side,
        state: event.state,
        reason: event.reason,
        nextOutSeq: session?.nextOutSeq ?? null,
        nextInSeq: session?.nextInSeq ?? null,
        at: Date.now(),
      });
    } else send(orderJson(event.entry));
  };

  const sandbox = new Sandbox({
    version: version.id,
    heartBtIntSec: ctx.config.heartbeatIntervalSec,
    instruments: INSTRUMENTS,
    seed: ctx.config.fillSeed,
    onEvent,
  });
  ctx.sandboxes.add(sandbox);

  send({
    type: "hello",
    sandboxId: `sbx_${randomBytes(3).toString("hex")}`,
    buyside: BUYSIDE,
    exchange: EXCH,
    heartBtIntSec: ctx.config.heartbeatIntervalSec,
    version: APP_VERSION,
    fixVersion: version.id,
    fixVersions: listVersions().map((v) => ({ id: v.id, label: v.label, status: v.status, summary: v.summary })),
  });

  // Idle timeout: close after SANDBOX_IDLE_TIMEOUT_SEC without client messages.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ws.close(1000, "idle timeout"), ctx.config.sandboxIdleTimeoutSec * 1000);
  };
  touch();

  const orderTimes: number[] = [];
  const rateLimited = () => {
    const now = Date.now();
    while (orderTimes.length && now - orderTimes[0]! >= 1000) orderTimes.shift();
    if (orderTimes.length >= ctx.config.orderRateLimitPerSec) return true;
    orderTimes.push(now);
    return false;
  };

  const ready = sandbox.start().catch((err: unknown) => {
    error("INTERNAL", `could not start the FIX sessions: ${String(err)}`);
    ws.close(1011, "internal error");
  });

  ws.on("message", (data, isBinary) => {
    touch();
    void ready.then(async () => {
      try {
        if (isBinary) throw new BadRequest("binary frames are not supported");
        await handleCommand(JSON.parse(String(data)) as unknown);
      } catch (err) {
        if (err instanceof SandboxError) error(err.code, err.message);
        else if (err instanceof BadRequest || err instanceof SyntaxError) error("BAD_REQUEST", err.message);
        else error("INTERNAL", String(err));
      }
    });
  });

  ws.on("close", () => {
    clearTimeout(idleTimer);
    ctx.sandboxes.delete(sandbox);
    void sandbox.close();
  });

  async function handleCommand(raw: unknown): Promise<void> {
    if (typeof raw !== "object" || raw === null || typeof (raw as { type?: unknown }).type !== "string") {
      throw new BadRequest("message must be a JSON object with a string type");
    }
    const cmd = raw as Record<string, unknown>;
    switch (cmd.type) {
      case "order.new": {
        if (rateLimited()) return error("RATE_LIMITED", "Too many orders; slow down a little.");
        const symbol = cmd.symbol;
        if (!INSTRUMENTS.some((i) => i.symbol === symbol)) throw new BadRequest(`unknown symbol ${String(symbol)}`);
        if (cmd.side !== "BUY" && cmd.side !== "SELL") throw new BadRequest("side must be BUY or SELL");
        if (!Number.isInteger(cmd.qty) || (cmd.qty as number) < 1 || (cmd.qty as number) > 1_000_000) {
          throw new BadRequest("qty must be an integer from 1 to 1,000,000");
        }
        if (cmd.ordType !== "LIMIT" && cmd.ordType !== "MARKET") throw new BadRequest("ordType must be LIMIT or MARKET");
        if (cmd.ordType === "LIMIT" && (typeof cmd.price !== "string" || !PRICE.test(cmd.price))) {
          throw new BadRequest("price must be a decimal string like 101.25");
        }
        sandbox.newOrder({
          symbol: symbol as string,
          side: cmd.side,
          qty: cmd.qty as number,
          ordType: cmd.ordType,
          price: cmd.ordType === "LIMIT" ? (cmd.price as string) : null,
        });
        return;
      }
      case "order.cancel": {
        if (rateLimited()) return error("RATE_LIMITED", "Too many orders; slow down a little.");
        if (typeof cmd.clOrdId !== "string") throw new BadRequest("clOrdId is required");
        sandbox.cancel(cmd.clOrdId);
        return;
      }
      case "fault.inject": {
        const side = cmd.side as Side;
        if (side !== BUYSIDE && side !== EXCH) throw new BadRequest("side must be BUYSIDE or EXCH");
        if (!FAULTS.includes(cmd.kind as FaultKind)) throw new BadRequest(`kind must be one of ${FAULTS.join(", ")}`);
        sandbox.injectFault(side, cmd.kind as FaultKind);
        send({ type: "fault.applied", side, kind: cmd.kind });
        return;
      }
      case "session.logout":
        if (cmd.side !== BUYSIDE && cmd.side !== EXCH) throw new BadRequest("side must be BUYSIDE or EXCH");
        sandbox.logout(cmd.side);
        return;
      case "session.logon":
        await sandbox.restart();
        return;
      case "autoplay.set":
        if (typeof cmd.on !== "boolean") throw new BadRequest("on must be true or false");
        sandbox.setAutoplay(cmd.on);
        return;
      default:
        throw new BadRequest(`unknown message type ${String(cmd.type)}`);
    }
  }
}

function wireJson(side: Side, wire: WireEvent, profile: ImplementedProfile, n: number): object {
  const other: Side = side === BUYSIDE ? EXCH : BUYSIDE;
  const display = toDisplay(wire.raw);
  const fields = splitFields(display);
  const msgType = wire.msg?.msgType ?? fields.find(([t]) => t === 35)?.[1] ?? "?";
  const info = profile.dictionary.msgTypes.get(msgType);
  const beginString = fields.find(([t]) => t === 8)?.[1];
  return {
    type: "fix.message",
    id: `m_${n}`,
    from: wire.direction === "out" ? side : other,
    to: wire.direction === "out" ? other : side,
    direction: wire.direction,
    msgType,
    msgTypeName: info?.name ?? "Unknown",
    category: info?.category ?? "admin",
    seq: wire.seq,
    possDup: wire.possDup,
    fixVersion: (beginString && versionForBeginString(beginString)?.id) || profile.id,
    raw: display,
    fields,
    dropped: wire.dropped,
    note: wire.note,
    at: wire.at,
  };
}

function orderJson(entry: BlotterEntry): object {
  return { type: "order.update", ...entry };
}
