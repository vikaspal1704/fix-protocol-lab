import { getField, type FixField } from "@fixlab/fix-core";
import { describe, expect, it } from "vitest";

import { dialectFor } from "../src/index.js";

const dialect = dialectFor("FIX.4.4");

describe("fix44 dialect", () => {
  it("fix44 dialect builds execution reports per spec", () => {
    const order = { clOrdId: "ORD-1", symbol: "DEMO", side: "BUY", qty: 10, ordType: "LIMIT", price: "101.00", transactTime: "" } as const;
    const working = { ...order, orderId: "EX-1", execId: "EXEC-2", cumQty: 10, leavesQty: 0, avgPx: "101.00", status: "FILLED" } as const;
    const tags = (fields: FixField[]) => fields.map(([t]) => t);

    expect(tags(dialect.executionReport({ kind: "fill", order: working, lastQty: 10, lastPx: "101.00" }))).toEqual([37, 11, 17, 150, 39, 55, 54, 38, 44, 32, 31, 151, 14, 6]);
    expect(tags(dialect.executionReport({ kind: "canceled", order: { ...working, status: "CANCELED" }, cancelClOrdId: "CXL-1" }))).toEqual([37, 11, 41, 17, 150, 39, 55, 54, 38, 44, 151, 14, 6]);
    expect(dialect.executionReport({ kind: "rejected", order: { ...working, status: "REJECTED" }, text: "x" }).at(-1)).toEqual([58, "x"]);
    const update = dialect.parseOrderUpdate({ beginString: "FIX.4.4", msgType: "8", fields: dialect.executionReport({ kind: "fill", order: working, lastQty: 10, lastPx: "101.00" }) });
    expect(update).toMatchObject({ clOrdId: "ORD-1", status: "FILLED", cumQty: 10, leavesQty: 0, avgPx: "101.00" });
    expect(getField({ beginString: "FIX.4.4", msgType: "D", fields: dialect.newOrderSingle({ ...order, ordType: "MARKET", price: null }) }, 44)).toBeUndefined();
  });
});
