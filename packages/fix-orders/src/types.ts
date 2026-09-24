import type { FixField, FixMessage } from "@fixlab/fix-core";

export type OrderSide = "BUY" | "SELL";
export type OrdType = "LIMIT" | "MARKET";
export type OrderStatus = "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED";

export interface NewOrder {
  readonly clOrdId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly qty: number;
  readonly ordType: OrdType;
  /** Decimal string; required for LIMIT. */
  readonly price: string | null;
  readonly transactTime: string;
}

export interface CancelRequest {
  readonly clOrdId: string;
  readonly origClOrdId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly qty: number;
  readonly transactTime: string;
}

/** Version-neutral order events produced by the exchange simulator. */
export type ExecEvent =
  | { readonly kind: "new"; readonly order: WorkingOrder }
  | { readonly kind: "fill"; readonly order: WorkingOrder; readonly lastQty: number; readonly lastPx: string }
  | { readonly kind: "canceled"; readonly order: WorkingOrder; readonly cancelClOrdId: string }
  | { readonly kind: "rejected"; readonly order: WorkingOrder; readonly text: string };

export interface WorkingOrder extends NewOrder {
  readonly orderId: string;
  readonly execId: string;
  readonly cumQty: number;
  readonly leavesQty: number;
  readonly avgPx: string;
  readonly status: OrderStatus;
}

export interface CancelReject {
  readonly orderId: string;
  readonly clOrdId: string;
  readonly origClOrdId: string;
  readonly status: OrderStatus | null;
  readonly reason: "TOO_LATE" | "UNKNOWN_ORDER";
  readonly text: string;
}

/** What the blotter learns from an ExecutionReport or OrderCancelReject. */
export interface OrderUpdate {
  readonly clOrdId: string;
  readonly orderId: string | null;
  readonly status: OrderStatus | null;
  readonly cumQty: number | null;
  readonly leavesQty: number | null;
  readonly avgPx: string | null;
  readonly text: string | null;
  /** For cancel replies: the order the cancel was about. */
  readonly origClOrdId: string | null;
  readonly cancelRejected: boolean;
}

/**
 * Everything version-specific about order messages (ARCHITECTURE §12).
 * Adding a FIX version means adding one of these; the exchange never changes.
 */
export interface OrderDialect {
  readonly versionId: string;
  newOrderSingle(o: NewOrder): FixField[];
  cancelRequest(c: CancelRequest): FixField[];
  executionReport(e: ExecEvent): FixField[];
  cancelReject(r: CancelReject): FixField[];
  parseNewOrder(m: FixMessage): NewOrder;
  parseCancelRequest(m: FixMessage): CancelRequest;
  parseOrderUpdate(m: FixMessage): OrderUpdate;
}
