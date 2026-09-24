import { encode, formatUtcTimestamp, getImplementedVersion, toDisplay } from "@fixlab/fix-core";
import { dialectFor } from "@fixlab/fix-orders";
import { useMemo, useState } from "react";

import { useInstrumentsQuery } from "../../api/rest";
import { useAppDispatch, useAppSelector } from "../../app/store";
import { Panel } from "../../components/Panel";
import { sendCommand } from "../connection/actions";
import { selectTag } from "../dictionary/uiSlice";

export const PRICE = /^\d{1,7}(\.\d{1,4})?$/;
const FALLBACK_INSTRUMENTS = [{ symbol: "DEMO", refPx: "101.00" }, { symbol: "ACME", refPx: "50.00" }];

export interface TicketValues {
  symbol: string;
  side: "BUY" | "SELL";
  ordType: "LIMIT" | "MARKET";
  qty: string;
  price: string;
}

export function validate(v: TicketValues): string | null {
  const qty = Number(v.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) return "Quantity must be a whole number from 1 to 1,000,000.";
  if (v.ordType === "LIMIT" && !PRICE.test(v.price)) return "Limit price must look like 101.25 (up to 4 decimals).";
  return null;
}

export function OrderTicket() {
  const dispatch = useAppDispatch();
  const { data: instruments = FALLBACK_INSTRUMENTS } = useInstrumentsQuery();
  const active = useAppSelector((s) => s.session.BUYSIDE.state === "ACTIVE" || s.session.BUYSIDE.state === "RESENDING");
  const [v, setV] = useState<TicketValues>({ symbol: "DEMO", side: "BUY", ordType: "LIMIT", qty: "100", price: "101.25" });
  const error = validate(v);
  const ref = instruments.find((i) => i.symbol === v.symbol)?.refPx;

  const set = (patch: Partial<TicketValues>) => setV((old) => ({ ...old, ...patch }));
  const submit = () => {
    if (error || !active) return;
    dispatch(
      sendCommand({
        type: "order.new",
        symbol: v.symbol,
        side: v.side,
        qty: Number(v.qty),
        ordType: v.ordType,
        ...(v.ordType === "LIMIT" ? { price: v.price } : {}),
      }),
    );
  };

  return (
    <Panel title="New order (35=D)">
      <form
        className="grid grid-cols-2 gap-2 p-3 text-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Symbol (55)</span>
          <select className="rounded border border-border bg-bg px-2 py-1" value={v.symbol} onChange={(e) => set({ symbol: e.target.value })}>
            {instruments.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[12px] text-muted">Side (54)</legend>
          <div className="flex overflow-hidden rounded border border-border">
            {(["BUY", "SELL"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={v.side === side}
                onClick={() => set({ side })}
                className={`flex-1 py-1 ${v.side === side ? (side === "BUY" ? "bg-buy text-white" : "bg-sell text-white") : "bg-bg"}`}
              >
                {side === "BUY" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Quantity (38)</span>
          <input className="rounded border border-border bg-bg px-2 py-1 font-mono" inputMode="numeric" value={v.qty} onChange={(e) => set({ qty: e.target.value })} />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[12px] text-muted">Type (40)</legend>
          <div className="flex overflow-hidden rounded border border-border">
            {(["LIMIT", "MARKET"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={v.ordType === t} onClick={() => set({ ordType: t })} className={`flex-1 py-1 ${v.ordType === t ? "bg-accent text-accent-text" : "bg-bg"}`}>
                {t === "LIMIT" ? "Limit" : "Market"}
              </button>
            ))}
          </div>
        </fieldset>
        {v.ordType === "LIMIT" && (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              Limit price (44){ref && <> · crosses at ref {ref}: buy ≥ ref, sell ≤ ref</>}
            </span>
            <input className="rounded border border-border bg-bg px-2 py-1 font-mono" inputMode="decimal" value={v.price} onChange={(e) => set({ price: e.target.value })} />
          </label>
        )}
        {error && (
          <p role="alert" className="col-span-2 text-[12px] text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={Boolean(error) || !active} className="col-span-2 rounded-md bg-accent py-1.5 font-medium text-accent-text disabled:opacity-50">
          {active ? "Send NewOrderSingle" : "Waiting for an active session…"}
        </button>
      </form>
      <EncodedPreview values={v} disabled={Boolean(error)} />
    </Panel>
  );
}

/** Shows the exact NewOrderSingle the server will send, encoded with the same codec. */
export function EncodedPreview({ values, disabled }: { values: TicketValues; disabled: boolean }) {
  const dispatch = useAppDispatch();
  const fixVersion = useAppSelector((s) => s.connection.fixVersion);
  const nextSeq = useAppSelector((s) => s.session.BUYSIDE.nextOutSeq ?? 2);
  const nextOrder = useAppSelector((s) => s.orders.order.filter((id) => id.startsWith("ORD-")).length + 1);

  const preview = useMemo(() => {
    if (disabled) return null;
    try {
      const now = formatUtcTimestamp(Date.now());
      const body = dialectFor(fixVersion).newOrderSingle({
        clOrdId: `ORD-${nextOrder}`,
        symbol: values.symbol,
        side: values.side,
        qty: Number(values.qty),
        ordType: values.ordType,
        price: values.ordType === "LIMIT" ? values.price : null,
        transactTime: now,
      });
      const bytes = encode({
        beginString: getImplementedVersion(fixVersion).beginString,
        msgType: "D",
        fields: [[49, "BUYSIDE"], [56, "EXCH"], [34, String(nextSeq)], [52, now], ...body],
      });
      return toDisplay(bytes);
    } catch {
      return null;
    }
  }, [values, disabled, fixVersion, nextSeq, nextOrder]);

  const fields = preview?.split("|").filter(Boolean) ?? [];
  const bodyLength = fields.find((f) => f.startsWith("9="))?.slice(2);
  const checkSum = fields.find((f) => f.startsWith("10="))?.slice(3);

  return (
    <div className="border-t border-border p-3">
      <div className="mb-1 text-[12px] text-muted">Encoded preview (SOH shown as |)</div>
      <p data-testid="encoded-preview" className="break-all font-mono text-[12px] leading-5">
        {preview === null
          ? "Fix the order above to see its encoding."
          : fields.map((f, i) => {
              const tag = Number(f.slice(0, f.indexOf("=")));
              const cls = tag === 9 ? "bg-[var(--tag9)]" : tag === 10 ? "bg-[var(--tag10)]" : "";
              return (
                <span key={i}>
                  <button type="button" onClick={() => dispatch(selectTag(tag))} className={`rounded px-0.5 hover:underline ${cls}`}>
                    {f}
                  </button>
                  <span className="text-muted">|</span>
                </span>
              );
            })}
      </p>
      {preview !== null && (
        <p className="mt-2 text-[12px] text-muted">
          <span className="rounded bg-[var(--tag9)] px-1 font-mono">9={bodyLength}</span> counts the bytes from 35= to the delimiter before 10=.{" "}
          <span className="rounded bg-[var(--tag10)] px-1 font-mono">10={checkSum}</span> is the sum of every byte before it, modulo 256. Both change as you type.
        </p>
      )}
    </div>
  );
}
