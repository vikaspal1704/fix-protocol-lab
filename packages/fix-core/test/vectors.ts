import type { FixMessage } from "../src/index.js";

/** Golden vectors from docs/API_CONTRACT.md §1.3 ("|" = SOH). */
export const VECTORS = {
  A1: "8=FIX.4.4|9=72|35=A|49=BUYSIDE|56=EXCH|34=1|52=20260924-10:00:00.000|98=0|108=30|141=Y|10=083|",
  A2: "8=FIX.4.4|9=72|35=A|49=EXCH|56=BUYSIDE|34=1|52=20260924-10:00:00.001|98=0|108=30|141=Y|10=084|",
  A3: "8=FIX.4.4|9=128|35=D|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:05.000|11=ORD-1|55=DEMO|54=1|60=20260924-10:00:05.000|38=100|40=2|44=101.25|59=0|10=073|",
  A4: "8=FIX.4.4|9=139|35=8|49=EXCH|56=BUYSIDE|34=2|52=20260924-10:00:05.001|37=EX-1|11=ORD-1|17=EXEC-1|150=0|39=0|55=DEMO|54=1|38=100|44=101.25|151=100|14=0|6=0|10=085|",
  B1: "8=FIX.4.4|9=54|35=0|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:00:35.000|10=006|",
  B2: "8=FIX.4.4|9=127|35=D|49=BUYSIDE|56=EXCH|34=4|52=20260924-10:00:35.400|11=ORD-2|55=DEMO|54=2|60=20260924-10:00:35.400|38=10|40=2|44=102.00|59=0|10=036|",
  B3: "8=FIX.4.4|9=63|35=2|49=EXCH|56=BUYSIDE|34=5|52=20260924-10:00:35.401|7=3|16=0|10=140|",
  B4: "8=FIX.4.4|9=96|35=4|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:00:35.402|43=Y|122=20260924-10:00:35.000|123=Y|36=4|10=016|",
  B5: "8=FIX.4.4|9=158|35=D|49=BUYSIDE|56=EXCH|34=4|52=20260924-10:00:35.402|43=Y|122=20260924-10:00:35.400|11=ORD-2|55=DEMO|54=2|60=20260924-10:00:35.400|38=10|40=2|44=102.00|59=0|10=032|",
  E1: "8=FIX.4.4|9=54|35=0|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:30.000|10=000|",
  E2: "8=FIX.4.4|9=96|35=4|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:01:00.010|43=Y|122=20260924-10:00:30.000|123=Y|36=4|10=255|",
} as const;

/** Build the FixMessage for a vector without using the codec under test. */
export function messageOf(display: string): FixMessage {
  const pairs = display
    .split("|")
    .filter(Boolean)
    .map((f) => {
      const i = f.indexOf("=");
      return [Number(f.slice(0, i)), f.slice(i + 1)] as const;
    });
  const get = (tag: number) => pairs.find(([t]) => t === tag)![1];
  return {
    beginString: get(8),
    msgType: get(35),
    fields: pairs.filter(([t]) => ![8, 9, 10, 35].includes(t)),
  };
}

/** Assemble a raw message with correct 9/10 around an arbitrary (possibly invalid) body. */
export function rawWithBody(body: string, beginString = "FIX.4.4"): string {
  const head = `8=${beginString}|9=${body.length}|${body}`;
  let sum = 0;
  for (const ch of head.replaceAll("|", "\x01")) sum = (sum + ch.charCodeAt(0)) % 256;
  return `${head}10=${String(sum).padStart(3, "0")}|`;
}
