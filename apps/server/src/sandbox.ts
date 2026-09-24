import { formatUtcTimestamp, getImplementedVersion, type FixMessage } from "@fixlab/fix-core";
import {
  connectInitiator,
  listenAcceptor,
  systemClock,
  type AcceptorHandle,
  type Clock,
  type FaultKind,
  type FixSession,
  type SessionState,
  type WireEvent,
} from "@fixlab/fix-session";

import type { Instrument } from "./config.js";
import { dialectFor, type OrderDialect, type OrderSide, type OrderStatus, type OrdType } from "./dialects/index.js";
import { ExchangeSimulator } from "./exchange.js";

export const BUYSIDE = "BUYSIDE";
export const EXCH = "EXCH";
export type Side = typeof BUYSIDE | typeof EXCH;

export interface BlotterEntry {
  clOrdId: string;
  orderId: string | null;
  symbol: string;
  side: OrderSide;
  qty: number;
  ordType: OrdType;
  price: string | null;
  status: OrderStatus | "PENDING_NEW";
  cumQty: number;
  leavesQty: number;
  avgPx: string;
  text: string | null;
}

export type SandboxEvent =
  | { type: "wire"; side: Side; wire: WireEvent }
  | { type: "state"; side: Side; state: SessionState; reason: string | null }
  | { type: "order"; entry: BlotterEntry };

export interface NewOrderCommand {
  symbol: string;
  side: OrderSide;
  qty: number;
  ordType: OrdType;
  price: string | null;
}

export interface SandboxOptions {
  version: string;
  heartBtIntSec: number;
  instruments: readonly Instrument[];
  clock?: Clock;
  seed?: number | null;
  onEvent: (event: SandboxEvent) => void;
}

/**
 * One visitor's private FIX world: a BUYSIDE initiator and an EXCH acceptor
 * talking real FIX over a loopback TCP connection, plus the exchange simulator.
 */
export class Sandbox {
  readonly version: string;
  private readonly dialect: OrderDialect;
  private readonly clock: Clock;
  private acceptor: AcceptorHandle | null = null;
  private exchange: ExchangeSimulator | null = null;
  buy: FixSession | null = null;
  exch: FixSession | null = null;
  readonly blotter = new Map<string, BlotterEntry>();
  private orderSeq = 0;
  private cancelSeq = 0;
  private autoplayTimer: unknown = null;
  private rng: () => number;
  private closed = false;

  constructor(private readonly opts: SandboxOptions) {
    this.version = getImplementedVersion(opts.version).id;
    this.dialect = dialectFor(this.version);
    this.clock = opts.clock ?? systemClock;
    this.rng = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  }

  /** Open the loopback connection and log on. */
  async start(): Promise<void> {
    const common = { version: this.version, heartBtIntSec: this.opts.heartBtIntSec, clock: this.clock };
    this.acceptor = await listenAcceptor({
      host: "127.0.0.1",
      port: 0,
      config: { ...common, role: "acceptor", senderCompId: EXCH, targetCompId: BUYSIDE },
    });
    const buy = await connectInitiator({
      host: "127.0.0.1",
      port: this.acceptor.port,
      config: { ...common, role: "initiator", senderCompId: BUYSIDE, targetCompId: EXCH },
    });
    const exch = await this.acceptor.session;
    if (this.closed) {
      await this.teardown();
      return;
    }

    this.exchange?.dispose();
    this.exchange = new ExchangeSimulator({
      clock: this.clock,
      dialect: this.dialect,
      instruments: this.opts.instruments,
      send: (type, fields) => {
        if (exch.state === "ACTIVE" || exch.state === "RESENDING") exch.send(type, fields);
      },
    });
    this.wire(buy, BUYSIDE);
    this.wire(exch, EXCH);
    exch.on("app", (msg) => this.exchange?.onAppMessage(msg));
    buy.on("app", (msg) => this.onBuysideApp(msg));
    this.buy = buy;
    this.exch = exch;
    buy.logon();
  }

  /** Log on again after a logout or disconnect (fresh TCP connection). */
  async restart(): Promise<void> {
    await this.teardown();
    this.blotter.clear();
    await this.start();
  }

  get active(): boolean {
    return this.buy?.state === "ACTIVE" || this.buy?.state === "RESENDING";
  }

  newOrder(cmd: NewOrderCommand): string {
    if (!this.buy || !this.active) throw new SandboxError("SESSION_NOT_ACTIVE", "BUYSIDE session is not active");
    const clOrdId = `ORD-${++this.orderSeq}`;
    const entry: BlotterEntry = {
      clOrdId,
      orderId: null,
      ...cmd,
      price: cmd.ordType === "LIMIT" ? cmd.price : null,
      status: "PENDING_NEW",
      cumQty: 0,
      leavesQty: cmd.qty,
      avgPx: "0",
      text: null,
    };
    this.blotter.set(clOrdId, entry);
    this.opts.onEvent({ type: "order", entry: { ...entry } });
    this.buy.send(
      "D",
      this.dialect.newOrderSingle({
        clOrdId,
        symbol: cmd.symbol,
        side: cmd.side,
        qty: cmd.qty,
        ordType: cmd.ordType,
        price: entry.price,
        transactTime: formatUtcTimestamp(this.clock.now()),
      }),
    );
    return clOrdId;
  }

  cancel(origClOrdId: string): string {
    if (!this.buy || !this.active) throw new SandboxError("SESSION_NOT_ACTIVE", "BUYSIDE session is not active");
    const entry = this.blotter.get(origClOrdId);
    if (!entry) throw new SandboxError("UNKNOWN_ORDER", `no order ${origClOrdId} in this sandbox`);
    const clOrdId = `CXL-${++this.cancelSeq}`;
    this.buy.send(
      "F",
      this.dialect.cancelRequest({
        clOrdId,
        origClOrdId,
        symbol: entry.symbol,
        side: entry.side,
        qty: entry.qty,
        transactTime: formatUtcTimestamp(this.clock.now()),
      }),
    );
    return clOrdId;
  }

  injectFault(side: Side, kind: FaultKind): void {
    const session = side === BUYSIDE ? this.buy : this.exch;
    if (!session) throw new SandboxError("SESSION_NOT_ACTIVE", `${side} session is not running`);
    session.injectFault(kind);
  }

  logout(side: Side): void {
    (side === BUYSIDE ? this.buy : this.exch)?.logout("Logout requested by visitor");
  }

  setAutoplay(on: boolean, intervalMs = 1500): void {
    this.clock.clearTimeout(this.autoplayTimer);
    this.autoplayTimer = null;
    if (!on) return;
    const step = () => {
      this.autoplayStep();
      this.autoplayTimer = this.clock.setTimeout(step, intervalMs);
    };
    this.autoplayTimer = this.clock.setTimeout(step, 200);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.setAutoplay(false);
    await this.teardown();
  }

  // ---------------------------------------------------------------- internal

  private autoplayStep(): void {
    if (!this.active) return;
    const open = [...this.blotter.values()].filter((o) => o.status === "NEW" || o.status === "PARTIALLY_FILLED");
    const roll = this.rng();
    try {
      if (roll < 0.25 && open.length > 0) {
        this.cancel(open[Math.floor(this.rng() * open.length)]!.clOrdId);
        return;
      }
      const instrument = this.opts.instruments[Math.floor(this.rng() * this.opts.instruments.length)]!;
      const ref = Number(instrument.refPx);
      const side: OrderSide = this.rng() < 0.5 ? "BUY" : "SELL";
      const crossing = roll < 0.75;
      const offset = (crossing ? 1 : -1) * (0.05 + Math.floor(this.rng() * 5) * 0.05);
      const price = side === "BUY" ? ref + offset : ref - offset;
      this.newOrder({
        symbol: instrument.symbol,
        side,
        qty: 10 * (1 + Math.floor(this.rng() * 20)),
        ordType: "LIMIT",
        price: price.toFixed(2),
      });
    } catch {
      // Session not active right now; the next tick tries again.
    }
  }

  private onBuysideApp(msg: FixMessage): void {
    if (msg.msgType !== "8" && msg.msgType !== "9") return;
    const update = this.dialect.parseOrderUpdate(msg);
    // Cancel replies are keyed by the cancel's ClOrdID; the order is OrigClOrdID.
    const key = update.origClOrdId ?? update.clOrdId;
    const entry = this.blotter.get(key);
    if (!entry) return;
    if (update.orderId && update.orderId !== "NONE") entry.orderId = update.orderId;
    if (update.cancelRejected) {
      entry.text = update.text;
    } else {
      if (update.status) entry.status = update.status;
      if (update.cumQty !== null) entry.cumQty = update.cumQty;
      if (update.leavesQty !== null) entry.leavesQty = update.leavesQty;
      if (update.avgPx !== null) entry.avgPx = update.avgPx;
      entry.text = update.text;
    }
    this.opts.onEvent({ type: "order", entry: { ...entry } });
  }

  private wire(session: FixSession, side: Side): void {
    session.on("wire", (wire) => this.opts.onEvent({ type: "wire", side, wire }));
    session.on("state", (state, reason) => this.opts.onEvent({ type: "state", side, state, reason }));
    session.on("error", () => {});
  }

  private async teardown(): Promise<void> {
    this.exchange?.dispose();
    this.exchange = null;
    for (const session of [this.buy, this.exch]) {
      if (session && session.state !== "DISCONNECTED") session.close("sandbox closed");
    }
    this.buy = null;
    this.exch = null;
    await this.acceptor?.close();
    this.acceptor = null;
  }
}

export class SandboxError extends Error {
  constructor(
    readonly code: "SESSION_NOT_ACTIVE" | "UNKNOWN_ORDER",
    message: string,
  ) {
    super(message);
  }
}

/** Small seeded PRNG so autoplay is reproducible with FILL_SEED. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

