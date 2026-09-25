import { defineDictionary } from "../../dictionary.js";
import { fix44Dictionary } from "../fix44/dictionary.js";

/**
 * FIX 4.3 over FIX 4.4: the order and execution fields are the same, except that
 * HandlInst (21) is still required on NewOrderSingle (4.4 made it optional).
 */
export const fix43Dictionary = defineDictionary(fix44Dictionary, {
  tags: [
    {
      tag: 21,
      name: "HandlInst",
      type: "CHAR",
      description:
        "How the broker may handle the order; required on NewOrderSingle before FIX 4.4.",
      values: {
        "1": "Automated execution, no broker intervention",
        "2": "Automated execution, broker intervention OK",
        "3": "Manual order",
      },
    },
  ],
});
