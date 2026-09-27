import { defineDictionary } from "../../dictionary.js";
import { fix43Dictionary } from "../fix43/dictionary.js";

/**
 * FIX 4.2 over FIX 4.3: execution reports carry ExecTransType (20), fills are
 * ExecType 1 (partial) / 2 (full) instead of F, and tag 32 is called LastShares.
 */
export const fix42Dictionary = defineDictionary(fix43Dictionary, {
  tags: [
    {
      tag: 20,
      name: "ExecTransType",
      type: "CHAR",
      description:
        "Whether this execution report is new or corrects/cancels an earlier one; removed after FIX 4.2.",
      values: { "0": "New", "1": "Cancel", "2": "Correct", "3": "Status" },
    },
    {
      tag: 150,
      name: "ExecType",
      type: "CHAR",
      description:
        "What this execution report is reporting; in FIX 4.2 a fill is 1 (partial) or 2 (full).",
      values: { "0": "New", "1": "Partial fill", "2": "Fill", "4": "Canceled", "8": "Rejected" },
    },
    {
      tag: 32,
      name: "LastShares",
      type: "QTY",
      description: "Quantity of this fill (renamed LastQty in FIX 4.3).",
    },
  ],
});
