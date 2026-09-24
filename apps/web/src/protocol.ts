/** WebSocket protocol types (docs/API_CONTRACT.md §5). */

export type Side = "BUYSIDE" | "EXCH";
export type SessionState = "DISCONNECTED" | "CONNECTED" | "LOGON_SENT" | "ACTIVE" | "RESENDING" | "LOGOUT_SENT";
export type FaultKind = "drop_next" | "pause_heartbeats" | "corrupt_next_checksum";
export type OrderStatus = "PENDING_NEW" | "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED";

export interface VersionInfo {
  id: string;
  label: string;
  status: "implemented" | "planned";
  summary: string;
}

export interface HelloEvent {
  type: "hello";
  sandboxId: string;
  buyside: string;
  exchange: string;
  heartBtIntSec: number;
  version: string;
  fixVersion: string;
  fixVersions: VersionInfo[];
}

export interface SessionStateEvent {
  type: "session.state";
  side: Side;
  state: SessionState;
  reason: string | null;
  nextOutSeq: number | null;
  nextInSeq: number | null;
  at: number;
}

export interface FixMessageEvent {
  type: "fix.message";
  id: string;
  from: Side;
  to: Side;
  direction: "out" | "in";
  msgType: string;
  msgTypeName: string;
  category: "admin" | "app";
  seq: number | null;
  possDup: boolean;
  fixVersion: string;
  raw: string;
  fields: [number, string][];
  dropped: boolean;
  note: string | null;
  at: number;
}

export interface OrderUpdateEvent {
  type: "order.update";
  clOrdId: string;
  orderId: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  ordType: "LIMIT" | "MARKET";
  price: string | null;
  status: OrderStatus;
  cumQty: number;
  leavesQty: number;
  avgPx: string;
  text: string | null;
}

export interface FaultAppliedEvent {
  type: "fault.applied";
  side: Side;
  kind: FaultKind;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}

export type ServerEvent =
  | HelloEvent
  | SessionStateEvent
  | FixMessageEvent
  | OrderUpdateEvent
  | FaultAppliedEvent
  | ErrorEvent;

export type ClientCommand =
  | { type: "order.new"; symbol: string; side: "BUY" | "SELL"; qty: number; ordType: "LIMIT" | "MARKET"; price?: string }
  | { type: "order.cancel"; clOrdId: string }
  | { type: "fault.inject"; side: Side; kind: FaultKind }
  | { type: "session.logout"; side: Side }
  | { type: "session.logon" }
  | { type: "autoplay.set"; on: boolean };
