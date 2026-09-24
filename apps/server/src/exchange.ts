import { formatUtcTimestamp, type FixField, type FixMessage } from "@fixlab/fix-core";
import type { Clock } from "@fixlab/fix-session";

import type { Instrument } from "./config.js";
import type { ExecEvent, NewOrder, OrderDialect, OrderStatus, WorkingOrder } from "@fixlab/fix-orders";

export const FIRST_FILL_DELAY_MS = 250;
export const SECOND_FILL_DELAY_MS = 500;

interface OrderState {
  order: NewOrder;
  orderId: string;
  execId: string;
  cumQty: number;
  notional: number;
  status: OrderStatus;
  timers: unknown[];
}

/** Price with 2–4 decimals, e.g. 101 -> "101.00", 101.12345 -> "101.1235". */
export function formatPx(value: number): string {
  const fixed = value.toFixed(4);
  return fixed.replace(/(\.\d{2}\d*?)0+$/, "$1");
}

/**
 * Simulated exchange (ARCHITECTURE §6). Order logic is version-neutral; every
 * FIX field goes through the sandbox version's OrderDialect.
 */
export class ExchangeSimulator {
  private readonly orders = new Map<string, OrderState>();
  private readonly refPx: Map<string, number>;
  private orderSeq = 0;
  private execSeq = 0;

  constructor(
    private readonly opts: {
      clock: Clock;
      dialect: OrderDialect;
      instruments: readonly Instrument[];
      send: (msgType: string, fields: FixField[]) => void;
    },
  ) {
    this.refPx = new Map(opts.instruments.map((i) => [i.symbol, Number(i.refPx)]));
  }

  /** Handle an application message received by the EXCH session. */
  onAppMessage(msg: FixMessage): void {
    if (msg.msgType === "D") this.onNewOrder(this.opts.dialect.parseNewOrder(msg));
    else if (msg.msgType === "F") this.onCancel(this.opts.dialect.parseCancelRequest(msg));
  }

  /** Stop pending fills (sandbox teardown). */
  dispose(): void {
    for (const state of this.orders.values()) this.clearTimers(state);
  }

  private onNewOrder(order: NewOrder): void {
    const state: OrderState = {
      order,
      orderId: `EX-${++this.orderSeq}`,
      execId: "",
      cumQty: 0,
      notional: 0,
      status: "NEW",
      timers: [],
    };
    this.orders.set(order.clOrdId, state);

    const ref = this.refPx.get(order.symbol);
    if (ref === undefined) {
      state.status = "REJECTED";
      this.report({ kind: "rejected", order: this.snapshot(state), text: "Unknown symbol" });
      return;
    }
    this.report({ kind: "new", order: this.snapshot(state) });

    const crosses =
      order.ordType === "MARKET" ||
      (order.side === "BUY" ? Number(order.price) >= ref : Number(order.price) <= ref);
    if (!crosses) return; // rests until cancelled

    const lastPx = formatPx(ref);
    const first = order.qty >= 2 ? Math.floor(order.qty / 2) : order.qty;
    const schedule = (delay: number, qty: number) =>
      state.timers.push(this.opts.clock.setTimeout(() => this.fill(state, qty, lastPx, ref), delay));
    schedule(FIRST_FILL_DELAY_MS, first);
    if (order.qty - first > 0) schedule(SECOND_FILL_DELAY_MS, order.qty - first);
  }

  private fill(state: OrderState, qty: number, lastPx: string, px: number): void {
    if (state.status === "CANCELED" || state.status === "FILLED") return;
    state.cumQty += qty;
    state.notional += qty * px;
    state.status = state.cumQty >= state.order.qty ? "FILLED" : "PARTIALLY_FILLED";
    this.report({ kind: "fill", order: this.snapshot(state), lastQty: qty, lastPx });
  }

  private onCancel(req: { clOrdId: string; origClOrdId: string }): void {
    const state = this.orders.get(req.origClOrdId);
    if (!state) {
      this.opts.send(
        "9",
        this.opts.dialect.cancelReject({
          orderId: "NONE",
          clOrdId: req.clOrdId,
          origClOrdId: req.origClOrdId,
          status: null,
          reason: "UNKNOWN_ORDER",
          text: "Unknown order",
        }),
      );
      return;
    }
    if (state.status !== "NEW" && state.status !== "PARTIALLY_FILLED") {
      this.opts.send(
        "9",
        this.opts.dialect.cancelReject({
          orderId: state.orderId,
          clOrdId: req.clOrdId,
          origClOrdId: req.origClOrdId,
          status: state.status,
          reason: "TOO_LATE",
          text: "Too late to cancel",
        }),
      );
      return;
    }
    this.clearTimers(state);
    state.status = "CANCELED";
    this.report({ kind: "canceled", order: this.snapshot(state), cancelClOrdId: req.clOrdId });
  }

  private report(event: ExecEvent): void {
    this.opts.send("8", this.opts.dialect.executionReport(event));
  }

  private snapshot(state: OrderState): WorkingOrder {
    state.execId = `EXEC-${++this.execSeq}`;
    const open = state.status === "NEW" || state.status === "PARTIALLY_FILLED";
    return {
      ...state.order,
      transactTime: formatUtcTimestamp(this.opts.clock.now()),
      orderId: state.orderId,
      execId: state.execId,
      cumQty: state.cumQty,
      leavesQty: open ? state.order.qty - state.cumQty : 0,
      avgPx: state.cumQty === 0 ? "0" : formatPx(state.notional / state.cumQty),
      status: state.status,
    };
  }

  private clearTimers(state: OrderState): void {
    for (const t of state.timers) this.opts.clock.clearTimeout(t);
    state.timers = [];
  }
}
