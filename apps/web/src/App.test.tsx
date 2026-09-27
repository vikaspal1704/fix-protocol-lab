import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { MAX_BACKOFF_MS, MIN_BACKOFF_MS } from "./features/connection/wsMiddleware";
import { FakeWebSocket } from "./test/fakeSocket";
import { fixEvent, HELLO, renderLive } from "./test/render";

afterEach(() => {
  vi.useRealTimers();
});

const NOS =
  "8=FIX.4.4|9=128|35=D|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:05.000|11=ORD-1|55=DEMO|54=1|60=20260924-10:00:05.000|38=100|40=2|44=101.25|59=0|10=073|";

describe("order entry", () => {
  it("order form shows live encoded preview", async () => {
    renderLive(<App />);
    const preview = screen.getByTestId("encoded-preview");
    const before = preview.textContent!;
    expect(before).toMatch(/^8=FIX\.4\.4\|9=\d+\|35=D\|49=BUYSIDE\|56=EXCH\|34=2\|/);
    expect(before).toContain("38=100");

    const qty = screen.getByLabelText("Quantity (38)");
    await userEvent.clear(qty);
    await userEvent.type(qty, "12345");

    const after = preview.textContent!;
    expect(after).toContain("38=12345");
    const len = (t: string) => /\|9=(\d+)\|/.exec(t)![1];
    expect(Number(len(after))).toBe(Number(len(before)) + 2);
    expect(/10=(\d{3})\|$/.exec(after)![1]).not.toBe(/10=(\d{3})\|$/.exec(before)![1]);
  });

  it("order form validates price and quantity", async () => {
    renderLive(<App />);
    const send = screen.getByRole("button", { name: "Send NewOrderSingle" });
    expect(send).toBeEnabled();

    const price = screen.getByLabelText(/Limit price \(44\)/);
    await userEvent.clear(price);
    await userEvent.type(price, "1.23456");

    expect(screen.getByRole("alert")).toHaveTextContent("Limit price must look like 101.25");
    expect(send).toBeDisabled();
  });

  it("sends an order command over the socket", async () => {
    const { ws } = renderLive(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Send NewOrderSingle" }));

    expect(ws.sent).toContainEqual({ type: "order.new", symbol: "DEMO", side: "BUY", qty: 100, ordType: "LIMIT", price: "101.25" });
  });
});

describe("visualizer", () => {
  it("visualizer renders arrows for out and in events", () => {
    const { emit } = renderLive(<App />);

    emit(fixEvent({ id: "m_1", msgType: "D", seq: 2, raw: NOS }));
    emit(fixEvent({ id: "m_2", msgType: "D", seq: 2, raw: NOS, direction: "in" }));

    const rows = within(screen.getByRole("list", { name: "FIX messages in time order" })).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("35=DNewOrderSingle#2");
    expect(within(rows[0]!).getByRole("button")).toHaveAccessibleName(
      "BUYSIDE to EXCH: NewOrderSingle (35=D), MsgSeqNum 2, delivered",
    );
  });

  it("visualizer marks dropped messages", () => {
    const { emit } = renderLive(<App />);

    emit(fixEvent({ id: "m_1", msgType: "0", seq: 3, dropped: true, note: "dropped in transit (fault)" }));

    const row = screen.getByRole("button", { name: /Heartbeat.*dropped in transit/ });
    expect(row).toHaveTextContent("dropped");
  });

  it("visualizer can hide admin messages", async () => {
    const { emit } = renderLive(<App />);
    emit(fixEvent({ id: "m_1", msgType: "0", seq: 3 }));
    emit(fixEvent({ id: "m_2", msgType: "D", seq: 4, raw: NOS }));

    await userEvent.click(screen.getByRole("button", { name: "Hide heartbeats" }));

    const list = screen.getByRole("list", { name: "FIX messages in time order" });
    expect(within(list).queryByText("Heartbeat")).toBeNull();
    expect(within(list).getByText("NewOrderSingle")).toBeInTheDocument();
  });

  it("visualizer shows the fix version of each message", async () => {
    const { emit } = renderLive(<App />);
    emit(fixEvent({ id: "m_1", msgType: "D", raw: NOS }));

    await userEvent.click(screen.getByRole("button", { name: /NewOrderSingle \(35=D\)/ }));

    const inspector = screen.getByRole("region", { name: /Message inspector/ });
    const chips = within(inspector).getAllByText("FIX.4.4").filter((el) => !el.closest("table"));
    expect(chips).toHaveLength(1);
  });
});

describe("inspector and dictionary", () => {
  it("inspector shows raw and parsed fields", async () => {
    const { emit } = renderLive(<App />);
    emit(fixEvent({ id: "m_1", msgType: "D", raw: NOS }));

    await userEvent.click(screen.getByRole("button", { name: /NewOrderSingle \(35=D\)/ }));

    expect(screen.getByTestId("raw").textContent).toBe(NOS);
    const table = within(screen.getByRole("region", { name: /Message inspector/ })).getByRole("table");
    expect(within(table).getByText("OrdType")).toBeInTheDocument();
    expect(within(table).getByText("Limit")).toBeInTheDocument();
  });

  it("clicking a tag opens its dictionary entry", async () => {
    const { emit } = renderLive(<App />);
    emit(fixEvent({ id: "m_1", msgType: "D", raw: NOS }));
    await userEvent.click(screen.getByRole("button", { name: /NewOrderSingle \(35=D\)/ }));

    await userEvent.click(within(screen.getByTestId("raw")).getByRole("button", { name: "54=1" }));

    const panel = screen.getByRole("region", { name: /Tag reference/ });
    expect(panel).toHaveTextContent("Side");
    expect(panel).toHaveTextContent("1Buy");
    expect(panel).toHaveTextContent("2Sell");
  });
});

describe("session controls", () => {
  it("fault buttons send fault inject commands", async () => {
    const { ws } = renderLive(<App />);

    const buyCard = screen.getAllByRole("button", { name: "Drop next message" })[0]!;
    await userEvent.click(buyCard);

    expect(ws.sent).toContainEqual({ type: "fault.inject", side: "BUYSIDE", kind: "drop_next" });
  });

  it("version picker lists implemented and planned versions", () => {
    renderLive(<App />);

    const picker = screen.getByRole("radiogroup", { name: "FIX version" });
    expect(within(picker).getByRole("radio", { name: /FIX 4\.4/ })).toBeChecked();
    expect(within(picker).getByRole("radio", { name: /FIX 4\.2/ })).toBeEnabled();
    expect(within(picker).getByRole("radio", { name: /FIX 4\.1.*planned/i })).toBeDisabled();
    expect(screen.getByTestId("version-summary")).toHaveTextContent("Most deployed.");
  });

  it("switching version reconnects and encodes orders for that version", async () => {
    renderLive(<App />);

    await userEvent.click(screen.getByRole("radio", { name: /FIX 4\.2/ }));
    const ws = FakeWebSocket.latest();
    expect(ws.url).toContain("/ws?fixVersion=FIX.4.2");
    act(() => ws.open());
    act(() => ws.emit({ ...HELLO, fixVersion: "FIX.4.2" }));
    for (const side of ["BUYSIDE", "EXCH"] as const) {
      act(() => ws.emit({ type: "session.state", side, state: "ACTIVE", reason: "logged on", nextOutSeq: 2, nextInSeq: 2, at: 0 }));
    }

    const preview = screen.getByTestId("encoded-preview").textContent!;
    expect(preview).toMatch(/^8=FIX\.4\.2\|9=\d+\|35=D\|/);
    expect(preview).toContain("|21=1|"); // HandlInst is required before FIX 4.4
    expect(screen.getByTestId("version-summary")).toHaveTextContent("Fills use ExecType 1/2.");
  });

  it("reconnects with backoff after socket close", () => {
    vi.useFakeTimers();
    const { ws } = renderLive(<App />);

    const before = FakeWebSocket.instances.length;
    act(() => ws.serverClose(1006));

    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting in 1 s");
    act(() => vi.advanceTimersByTime(MIN_BACKOFF_MS - 1));
    expect(FakeWebSocket.instances).toHaveLength(before);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
    expect(FakeWebSocket.latest().url).toContain("/ws?fixVersion=FIX.4.4");
    expect(MAX_BACKOFF_MS).toBe(10_000);
  });
});
