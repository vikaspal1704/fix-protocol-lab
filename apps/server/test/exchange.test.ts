import { encode, formatUtcTimestamp, toDisplay, type FixField, type FixMessage } from "@fixlab/fix-core";
import { createPipe, FixSession, ManualClock } from "@fixlab/fix-session";
import { describe, expect, it } from "vitest";

import { INSTRUMENTS } from "../src/config.js";
import { dialectFor } from "@fixlab/fix-orders";
import { ExchangeSimulator, formatPx } from "../src/exchange.js";
import { VERSION_VECTORS } from "../../../packages/fix-core/test/vectors.js";

const T0 = Date.UTC(2026, 8, 24, 10, 0, 5, 0);
const dialect = dialectFor("FIX.4.4");

function setup() {
  const clock = new ManualClock(T0);
  const sent: { type: string; fields: FixField[] }[] = [];
  const exchange = new ExchangeSimulator({
    clock,
    dialect,
    instruments: INSTRUMENTS,
    send: (type, fields) => sent.push({ type, fields }),
  });
  const msg = (type: string, fields: FixField[]): FixMessage => ({ beginString: "FIX.4.4", msgType: type, fields });
  const get = (i: number, tag: number) => sent[i]!.fields.find(([t]) => t === tag)?.[1];
  const order = (clOrdId: string, side: "1" | "2", qty: number, price: string | null, symbol = "DEMO") =>
    exchange.onAppMessage(
      msg("D", [
        [11, clOrdId],
        [55, symbol],
        [54, side],
        [60, formatUtcTimestamp(T0)],
        [38, String(qty)],
        [40, price === null ? "1" : "2"],
        ...(price === null ? [] : ([[44, price]] as FixField[])),
        [59, "0"],
      ]),
    );
  const cancel = (orig: string, clOrdId = "CXL-1") =>
    exchange.onAppMessage(msg("F", [[41, orig], [11, clOrdId], [55, "DEMO"], [54, "1"], [38, "1"]]));
  return { clock, sent, get, order, cancel };
}

describe("exchange simulator", () => {
  it("exchange acks new order", () => {
    const { sent, get, order } = setup();

    order("ORD-1", "1", 100, "101.25");

    expect(sent.map((s) => s.type)).toEqual(["8"]);
    expect([get(0, 37), get(0, 150), get(0, 39), get(0, 151), get(0, 14), get(0, 6)]).toEqual(["EX-1", "0", "0", "100", "0", "0"]);
    // Body fields match golden vector A4 exactly.
    const a4 = encode({
      beginString: "FIX.4.4",
      msgType: "8",
      fields: [[49, "EXCH"], [56, "BUYSIDE"], [34, "2"], [52, "20260924-10:00:05.001"], ...sent[0]!.fields],
    });
    expect(toDisplay(a4)).toBe(
      "8=FIX.4.4|9=139|35=8|49=EXCH|56=BUYSIDE|34=2|52=20260924-10:00:05.001|37=EX-1|11=ORD-1|17=EXEC-1|150=0|39=0|55=DEMO|54=1|38=100|44=101.25|151=100|14=0|6=0|10=085|",
    );
  });

  it("exchange fills crossing limit order in two parts", () => {
    const { clock, sent, get, order } = setup();
    order("ORD-1", "1", 100, "101.25");

    clock.advance(249);
    expect(sent).toHaveLength(1);
    clock.advance(1);
    expect([get(1, 150), get(1, 39), get(1, 32), get(1, 31), get(1, 14), get(1, 151)]).toEqual(["F", "1", "50", "101.00", "50", "50"]);
    clock.advance(250);
    expect([get(2, 150), get(2, 39), get(2, 32), get(2, 14), get(2, 151), get(2, 6)]).toEqual(["F", "2", "50", "100", "0", "101.00"]);
  });

  it("exchange fills quantity one in a single fill", () => {
    const { clock, sent, get, order } = setup();
    order("ORD-1", "2", 1, "100.00");

    clock.advance(1000);

    expect(sent).toHaveLength(2);
    expect([get(1, 39), get(1, 32)]).toEqual(["2", "1"]);
  });

  it("exchange rests non-crossing order", () => {
    const { clock, sent, order } = setup();
    order("ORD-1", "1", 10, "100.50"); // buy below refPx 101.00

    clock.advance(10_000);

    expect(sent).toHaveLength(1);
  });

  it("exchange fills market order at reference price", () => {
    const { clock, get, order } = setup();
    order("ORD-1", "2", 4, null, "ACME");

    clock.advance(1000);

    expect([get(1, 31), get(2, 31), get(2, 39), get(2, 6)]).toEqual(["50.00", "50.00", "2", "50.00"]);
  });

  it("exchange cancels working order and stops pending fills", () => {
    const { clock, sent, get, order, cancel } = setup();
    order("ORD-1", "1", 100, "101.25");

    cancel("ORD-1");
    clock.advance(1000);

    expect(sent).toHaveLength(2);
    expect([get(1, 150), get(1, 39), get(1, 41), get(1, 11), get(1, 151)]).toEqual(["4", "4", "ORD-1", "CXL-1", "0"]);
  });

  it("exchange rejects cancel of filled order as too late", () => {
    const { clock, sent, get, order, cancel } = setup();
    order("ORD-1", "1", 2, "101.25");
    clock.advance(1000);

    cancel("ORD-1");

    expect(sent.at(-1)!.type).toBe("9");
    expect([get(sent.length - 1, 102), get(sent.length - 1, 434), get(sent.length - 1, 39)]).toEqual(["0", "1", "2"]);
  });

  it("exchange rejects cancel of unknown order", () => {
    const { sent, get, cancel } = setup();

    cancel("NOPE");

    expect(sent[0]!.type).toBe("9");
    expect([get(0, 102), get(0, 58)]).toEqual(["1", "Unknown order"]);
  });

  it("exchange rejects unknown symbol", () => {
    const { sent, get, order } = setup();

    order("ORD-1", "1", 1, "1.00", "ZZZ");

    expect([get(0, 150), get(0, 39), get(0, 58)]).toEqual(["8", "8", "Unknown symbol"]);
    expect(sent).toHaveLength(1);
  });

  it("formats prices with two to four decimals", () => {
    expect([formatPx(101), formatPx(101.1), formatPx(101.12345), formatPx(50.5)]).toEqual(["101.00", "101.10", "101.1235", "50.50"]);
  });
});

describe("exchange in every fix version", () => {
  for (const [version, vectors] of Object.entries(VERSION_VECTORS)) {
    it(`exchange flow in ${version} produces valid execution reports`, () => {
      const clock = new ManualClock(Date.UTC(2026, 8, 24, 10, 0, 0, 0));
      const [a, b] = createPipe(clock, 1);
      const base = { version, heartBtIntSec: 30, clock };
      const buy = new FixSession({ ...base, role: "initiator", senderCompId: "BUYSIDE", targetCompId: "EXCH" });
      const exch = new FixSession({ ...base, role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE" });
      const sent = { buy: [] as string[], exch: [] as string[] };
      buy.on("wire", (w) => w.direction === "out" && sent.buy.push(toDisplay(w.raw)));
      exch.on("wire", (w) => w.direction === "out" && sent.exch.push(toDisplay(w.raw)));
      const versionDialect = dialectFor(version);
      const exchange = new ExchangeSimulator({ clock, dialect: versionDialect, instruments: INSTRUMENTS, send: (t, f) => exch.send(t, f) });
      exch.on("app", (m) => exchange.onAppMessage(m));
      const updates: string[] = [];
      buy.on("app", (m) => updates.push(versionDialect.parseOrderUpdate(m).status ?? "?"));
      buy.attach(a);
      exch.attach(b);

      buy.logon();
      clock.advanceTo(clock.now() + 5000);
      buy.send("D", versionDialect.newOrderSingle({ clOrdId: "ORD-1", symbol: "DEMO", side: "BUY", qty: 100, ordType: "LIMIT", price: "101.25", transactTime: formatUtcTimestamp(clock.now()) }));
      clock.advance(600);

      expect(sent.buy).toEqual([vectors.LOGON, vectors.ORDER]);
      expect(sent.exch).toEqual([vectors.LOGON_REPLY, vectors.ACK, vectors.PARTIAL, vectors.FILL]);
      expect(updates).toEqual(["NEW", "PARTIALLY_FILLED", "FILLED"]);
    });
  }
});
