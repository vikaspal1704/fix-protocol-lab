import type { FixField } from "@fixlab/fix-core";
import { describe, expect, it } from "vitest";

import { dialectFor, hasDialect, type WorkingOrder } from "../src/index.js";

const order = { clOrdId: "ORD-1", symbol: "DEMO", side: "BUY", qty: 100, ordType: "LIMIT", price: "101.25", transactTime: "" } as const;
const working = (status: WorkingOrder["status"], cumQty: number): WorkingOrder => ({
  ...order,
  orderId: "EX-1",
  execId: "EXEC-2",
  cumQty,
  leavesQty: 100 - cumQty,
  avgPx: "101.00",
  status,
});
const tags = (fields: FixField[]) => fields.map(([t]) => t);
const get = (fields: FixField[], tag: number) => fields.find(([t]) => t === tag)?.[1];

describe("order dialects", () => {
  it("every implemented version has a dialect", () => {
    for (const id of ["FIX.4.2", "FIX.4.3", "FIX.4.4", "FIX.5.0SP2"]) expect(hasDialect(id), id).toBe(true);
    expect(() => dialectFor("FIX.4.1")).toThrow(/no order dialect/);
  });

  it("fix42 dialect uses ExecTransType and ExecType 1/2 for fills", () => {
    const d = dialectFor("FIX.4.2");
    const partial = d.executionReport({ kind: "fill", order: working("PARTIALLY_FILLED", 50), lastQty: 50, lastPx: "101.00" });
    const full = d.executionReport({ kind: "fill", order: working("FILLED", 100), lastQty: 50, lastPx: "101.00" });

    expect(tags(partial)).toEqual([37, 11, 17, 20, 150, 39, 55, 54, 38, 44, 32, 31, 151, 14, 6]);
    expect([get(partial, 20), get(partial, 150), get(partial, 39)]).toEqual(["0", "1", "1"]);
    expect([get(full, 150), get(full, 39)]).toEqual(["2", "2"]);
    expect(get(d.newOrderSingle(order), 21)).toBe("1");
  });

  it("fix43 dialect drops ExecTransType but keeps HandlInst", () => {
    const d = dialectFor("FIX.4.3");
    const fill = d.executionReport({ kind: "fill", order: working("FILLED", 100), lastQty: 100, lastPx: "101.00" });

    expect(get(fill, 20)).toBeUndefined();
    expect(get(fill, 150)).toBe("F");
    expect(tags(d.newOrderSingle(order))).toEqual([11, 21, 55, 54, 60, 38, 40, 44, 59]);
  });

  it("fix50sp2 dialect sends the FIX 4.4 order shapes", () => {
    const fix44 = dialectFor("FIX.4.4");
    const fix50 = dialectFor("FIX.5.0SP2");
    const fill = { kind: "fill", order: working("FILLED", 100), lastQty: 100, lastPx: "101.00" } as const;

    expect(fix50.newOrderSingle(order)).toEqual(fix44.newOrderSingle(order));
    expect(fix50.executionReport(fill)).toEqual(fix44.executionReport(fill));
    expect(get(fix50.newOrderSingle(order), 21)).toBeUndefined();
  });

  it("every dialect parses its own execution reports for the blotter", () => {
    for (const id of ["FIX.4.2", "FIX.4.3", "FIX.4.4", "FIX.5.0SP2"]) {
      const d = dialectFor(id);
      const fields = d.executionReport({ kind: "fill", order: working("PARTIALLY_FILLED", 50), lastQty: 50, lastPx: "101.00" });
      const update = d.parseOrderUpdate({ beginString: id, msgType: "8", fields });

      expect(update, id).toMatchObject({ clOrdId: "ORD-1", status: "PARTIALLY_FILLED", cumQty: 50, leavesQty: 50, avgPx: "101.00" });
      expect(d.parseNewOrder({ beginString: id, msgType: "D", fields: d.newOrderSingle(order) }), id).toMatchObject({ clOrdId: "ORD-1", qty: 100, price: "101.25" });
    }
  });
});
