import { getField, requireField, type FixField, type FixMessage } from "@fixlab/fix-core";

import type {
  CancelReject,
  CancelRequest,
  ExecEvent,
  NewOrder,
  OrderDialect,
  OrderStatus,
  OrderUpdate,
} from "./types.js";

const SIDE_CODE = { BUY: "1", SELL: "2" } as const;
const STATUS_CODE: Record<OrderStatus, string> = {
  NEW: "0",
  PARTIALLY_FILLED: "1",
  FILLED: "2",
  CANCELED: "4",
  REJECTED: "8",
};
const STATUS_FROM_CODE = Object.fromEntries(
  Object.entries(STATUS_CODE).map(([k, v]) => [v, k as OrderStatus]),
) as Record<string, OrderStatus>;

function sideOf(code: string): "BUY" | "SELL" {
  if (code === "1") return "BUY";
  if (code === "2") return "SELL";
  throw new Error(`unsupported Side ${code}`);
}

const num = (m: FixMessage, tag: number): number | null => {
  const v = getField(m, tag);
  return v === undefined ? null : Number(v);
};

/** FIX 4.4: ExecType F for every fill; OrdStatus carries partial vs full. */
export const fix44Dialect: OrderDialect = {
  versionId: "FIX.4.4",

  newOrderSingle(o: NewOrder): FixField[] {
    const fields: FixField[] = [
      [11, o.clOrdId],
      [55, o.symbol],
      [54, SIDE_CODE[o.side]],
      [60, o.transactTime],
      [38, String(o.qty)],
      [40, o.ordType === "LIMIT" ? "2" : "1"],
    ];
    if (o.ordType === "LIMIT" && o.price !== null) fields.push([44, o.price]);
    fields.push([59, "0"]);
    return fields;
  },

  cancelRequest(c: CancelRequest): FixField[] {
    return [
      [41, c.origClOrdId],
      [11, c.clOrdId],
      [55, c.symbol],
      [54, SIDE_CODE[c.side]],
      [60, c.transactTime],
      [38, String(c.qty)],
    ];
  },

  executionReport(e: ExecEvent): FixField[] {
    const o = e.order;
    const execType = { new: "0", fill: "F", canceled: "4", rejected: "8" }[e.kind];
    const fields: FixField[] = [
      [37, o.orderId],
      [11, e.kind === "canceled" ? e.cancelClOrdId : o.clOrdId],
    ];
    if (e.kind === "canceled") fields.push([41, o.clOrdId]);
    fields.push(
      [17, o.execId],
      [150, execType],
      [39, STATUS_CODE[o.status]],
      [55, o.symbol],
      [54, SIDE_CODE[o.side]],
      [38, String(o.qty)],
    );
    if (o.price !== null) fields.push([44, o.price]);
    if (e.kind === "fill") fields.push([32, String(e.lastQty)], [31, e.lastPx]);
    fields.push([151, String(o.leavesQty)], [14, String(o.cumQty)], [6, o.avgPx]);
    if (e.kind === "rejected") fields.push([58, e.text]);
    return fields;
  },

  cancelReject(r: CancelReject): FixField[] {
    return [
      [37, r.orderId],
      [11, r.clOrdId],
      [41, r.origClOrdId],
      [39, r.status === null ? "8" : STATUS_CODE[r.status]],
      [434, "1"],
      [102, r.reason === "TOO_LATE" ? "0" : "1"],
      [58, r.text],
    ];
  },

  parseNewOrder(m: FixMessage): NewOrder {
    const ordType = requireField(m, 40) === "1" ? "MARKET" : "LIMIT";
    return {
      clOrdId: requireField(m, 11),
      symbol: requireField(m, 55),
      side: sideOf(requireField(m, 54)),
      qty: Number(requireField(m, 38)),
      ordType,
      price: ordType === "LIMIT" ? requireField(m, 44) : null,
      transactTime: getField(m, 60) ?? "",
    };
  },

  parseCancelRequest(m: FixMessage): CancelRequest {
    return {
      clOrdId: requireField(m, 11),
      origClOrdId: requireField(m, 41),
      symbol: getField(m, 55) ?? "",
      side: sideOf(getField(m, 54) ?? "1"),
      qty: Number(getField(m, 38) ?? "0"),
      transactTime: getField(m, 60) ?? "",
    };
  },

  parseOrderUpdate(m: FixMessage): OrderUpdate {
    const status = getField(m, 39);
    const cancelRejected = m.msgType === "9";
    return {
      clOrdId: requireField(m, 11),
      orderId: getField(m, 37) ?? null,
      status: status === undefined ? null : (STATUS_FROM_CODE[status] ?? null),
      cumQty: num(m, 14),
      leavesQty: num(m, 151),
      avgPx: getField(m, 6) ?? null,
      text: getField(m, 58) ?? null,
      origClOrdId: getField(m, 41) ?? null,
      cancelRejected,
    };
  },
};
