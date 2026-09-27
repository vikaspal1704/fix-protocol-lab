import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { Provider } from "react-redux";

import { makeStore } from "../app/store";
import { connect } from "../features/connection/actions";
import type { FixMessageEvent, HelloEvent, ServerEvent } from "../protocol";
import { FakeWebSocket } from "./fakeSocket";

export const HELLO: HelloEvent = {
  type: "hello",
  sandboxId: "sbx_test",
  buyside: "BUYSIDE",
  exchange: "EXCH",
  heartBtIntSec: 10,
  version: "0.1.0",
  fixVersion: "FIX.4.4",
  fixVersions: [
    { id: "FIX.4.1", label: "FIX 4.1", status: "planned", summary: "Test-only planned version." },
    { id: "FIX.4.2", label: "FIX 4.2", status: "implemented", summary: "Fills use ExecType 1/2." },
    { id: "FIX.4.4", label: "FIX 4.4", status: "implemented", summary: "Most deployed." },
  ],
};

/** Render with a store connected to a fake socket in which both sides are logged on. */
export function renderLive(ui: ReactElement) {
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
  const store = makeStore();
  const view = render(<Provider store={store}>{ui}</Provider>);
  act(() => {
    store.dispatch(connect({ fixVersion: "FIX.4.4" }));
  });
  const ws = FakeWebSocket.latest();
  const emit = (e: ServerEvent) => act(() => ws.emit(e));
  act(() => ws.open());
  emit(HELLO);
  for (const side of ["BUYSIDE", "EXCH"] as const) {
    emit({ type: "session.state", side, state: "ACTIVE", reason: "logged on", nextOutSeq: 2, nextInSeq: 2, at: 0 });
  }
  return { store, ws, emit, ...view };
}

export function fixEvent(partial: Partial<FixMessageEvent> & Pick<FixMessageEvent, "id" | "msgType">): FixMessageEvent {
  const raw = partial.raw ?? `8=FIX.4.4|9=5|35=${partial.msgType}|34=${partial.seq ?? 2}|10=000|`;
  return {
    type: "fix.message",
    from: "BUYSIDE",
    to: "EXCH",
    direction: "out",
    msgTypeName: partial.msgType === "D" ? "NewOrderSingle" : partial.msgType === "0" ? "Heartbeat" : "Message",
    category: partial.msgType === "D" || partial.msgType === "8" ? "app" : "admin",
    seq: 2,
    possDup: false,
    fixVersion: "FIX.4.4",
    fields: raw
      .split("|")
      .filter(Boolean)
      .map((f) => [Number(f.split("=")[0]), f.slice(f.indexOf("=") + 1)] as [number, string]),
    dropped: false,
    note: null,
    at: Date.UTC(2026, 8, 24, 10, 0, 5),
    ...partial,
    raw,
  };
}
