import { useAppDispatch, useAppSelector } from "../../app/store";
import { Chip, Panel } from "../../components/Panel";
import type { OrderStatus } from "../../protocol";
import { sendCommand } from "../connection/actions";

const TONE: Record<OrderStatus, "muted" | "ok" | "warn" | "bad" | "accent"> = {
  PENDING_NEW: "muted",
  NEW: "accent",
  PARTIALLY_FILLED: "warn",
  FILLED: "ok",
  CANCELED: "muted",
  REJECTED: "bad",
};

export function Blotter() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.order.map((id) => s.orders.byId[id]!).filter(Boolean));

  return (
    <Panel title={`Orders (${orders.length})`}>
      <div className="max-h-72 overflow-auto">
        {orders.length === 0 ? (
          <p className="p-3 text-[12px] text-muted">No orders yet. Send one above, or turn on autoplay.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-panel text-left text-muted">
              <tr>
                <th className="px-3 py-1 font-medium">ClOrdID</th>
                <th className="px-1 py-1 font-medium">Order</th>
                <th className="px-1 py-1 text-right font-medium">Filled</th>
                <th className="px-1 py-1 font-medium">Status</th>
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cancellable = o.status === "NEW" || o.status === "PARTIALLY_FILLED" || o.status === "FILLED";
                return (
                  <tr key={o.clOrdId} className="border-t border-border align-top">
                    <td className="px-3 py-1 font-mono">{o.clOrdId}</td>
                    <td className="px-1 py-1">
                      <span className={o.side === "BUY" ? "text-buy" : "text-sell"}>{o.side === "BUY" ? "Buy" : "Sell"}</span> {o.qty} {o.symbol}{" "}
                      {o.ordType === "LIMIT" ? `@ ${o.price}` : "at market"}
                      {o.text && <div className="text-muted">{o.text}</div>}
                    </td>
                    <td className="px-1 py-1 text-right font-mono">
                      {o.cumQty}
                      {o.cumQty > 0 && <div className="text-muted">avg {o.avgPx}</div>}
                    </td>
                    <td className="px-1 py-1">
                      <Chip tone={TONE[o.status]}>{o.status.replace("_", " ").toLowerCase()}</Chip>
                    </td>
                    <td className="px-3 py-1 text-right">
                      {cancellable && (
                        <button
                          type="button"
                          title={o.status === "FILLED" ? "Already filled: the exchange will answer with OrderCancelReject (35=9)" : "Send OrderCancelRequest (35=F)"}
                          onClick={() => dispatch(sendCommand({ type: "order.cancel", clOrdId: o.clOrdId }))}
                          className="rounded border border-border px-1.5 py-0.5 hover:bg-panel-2"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
