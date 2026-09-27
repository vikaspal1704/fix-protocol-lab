import { defineDictionary } from "../../dictionary.js";
import { fix44Dictionary } from "../fix44/dictionary.js";

const APPL_VER_ID = { "7": "FIX 5.0", "8": "FIX 5.0 SP1", "9": "FIX 5.0 SP2" };

/**
 * FIX 5.0 SP2 over FIX 4.4: the order flow used here is unchanged. What's new is
 * the transport: the session layer is FIXT.1.1, and ApplVerID says which
 * application version the business messages use.
 */
export const fix50sp2Dictionary = defineDictionary(fix44Dictionary, {
  tags: [
    {
      tag: 8,
      name: "BeginString",
      type: "STRING",
      description:
        "Session protocol version; FIX 5.x runs over the FIXT.1.1 session layer. Always the first field.",
    },
    {
      tag: 1128,
      name: "ApplVerID",
      type: "STRING",
      description:
        "Application version of this one message, when it differs from the session default.",
      values: APPL_VER_ID,
    },
    {
      tag: 1137,
      name: "DefaultApplVerID",
      type: "STRING",
      description:
        "Application version both sides use for business messages, agreed on Logon (FIXT only).",
      values: APPL_VER_ID,
    },
  ],
});
