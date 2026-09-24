import { useEffect, useLayoutEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "../../app/store";
import { Panel } from "../../components/Panel";
import { select, toggleAdmin, toggleHeartbeats, togglePaused, visibleRows, type FlowRow } from "./messagesSlice";

const RENDER_LIMIT = 300;
const LANE_LEFT = "12%";
const LANE_RIGHT = "12%";

function time(ms: number): string {
  const d = new Date(ms);
  return `${d.toISOString().slice(11, 23)}`;
}

function describe(row: FlowRow): string {
  const outcome = { "in-flight": "in flight", delivered: "delivered", dropped: "dropped in transit", garbled: "rejected as garbled" }[row.delivery];
  return `${row.from} to ${row.to}: ${row.msgTypeName} (35=${row.msgType}), MsgSeqNum ${row.seq ?? "?"}${row.possDup ? ", possible duplicate" : ""}, ${outcome}`;
}

function Arrow({ row }: { row: FlowRow }) {
  const ltr = row.from === "BUYSIDE";
  const color = row.delivery === "dropped" || row.delivery === "garbled" ? "var(--bad)" : row.category === "app" ? "var(--app)" : "var(--admin)";
  const lineStyle = row.possDup ? "dashed" : "solid";
  // Dropped messages stop half way; everything else reaches the receiver's lifeline.
  const span = row.delivery === "dropped" ? "38%" : "76%";
  const start = ltr ? { left: LANE_LEFT } : { right: LANE_RIGHT };
  const end = ltr ? { left: `calc(${LANE_LEFT} + ${span})` } : { right: `calc(${LANE_RIGHT} + ${span})` };

  return (
    <>
      <div
        className={`flow-line absolute top-[27px] ${ltr ? "" : "rtl"}`}
        style={{ ...start, width: span, borderTop: `2px ${lineStyle} ${color}` }}
        aria-hidden
      />
      {row.delivery === "dropped" || row.delivery === "garbled" ? (
        <span className="absolute top-[18px] -translate-x-1/2 text-[15px] font-bold text-bad" style={ltr ? end : { right: `calc(${LANE_RIGHT} + ${span} - 10px)` }} aria-hidden>
          ✕
        </span>
      ) : (
        <span
          aria-hidden
          className="absolute top-[22px] h-0 w-0 border-y-[6px] border-y-transparent"
          style={
            ltr
              ? { right: LANE_RIGHT, borderLeft: `9px solid ${color}` }
              : { left: LANE_LEFT, borderRight: `9px solid ${color}` }
          }
        />
      )}
    </>
  );
}

export function SequenceDiagram() {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.messages);
  const rows = visibleRows(messages);
  const shown = rows.slice(-RENDER_LIMIT);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current && !messages.paused) el.scrollTop = el.scrollHeight;
  }, [shown.length, messages.paused]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const toggle = (label: string, on: boolean, action: () => void) => (
    <button type="button" aria-pressed={on} onClick={action} className={`rounded border px-2 py-0.5 text-[12px] ${on ? "border-accent text-accent" : "border-border text-muted hover:bg-panel-2"}`}>
      {label}
    </button>
  );

  return (
    <Panel
      className="h-full"
      title={`Live message flow · ${messages.totalSeen} messages`}
      actions={
        <div className="flex flex-wrap gap-1">
          {toggle("Hide heartbeats", messages.hideHeartbeats, () => dispatch(toggleHeartbeats()))}
          {toggle("Hide admin", messages.hideAdmin, () => dispatch(toggleAdmin()))}
          {toggle(messages.paused ? "Paused" : "Pause scroll", messages.paused, () => dispatch(togglePaused()))}
        </div>
      }
    >
      <div className="grid grid-cols-[76px_1fr] border-b border-border text-[12px] font-semibold">
        <div className="px-2 py-1.5 text-muted">UTC</div>
        <div className="relative h-8">
          <span className="absolute top-1.5 -translate-x-1/2" style={{ left: LANE_LEFT }}>
            BUYSIDE
          </span>
          <span className="absolute top-1.5 translate-x-1/2" style={{ right: LANE_RIGHT }}>
            EXCH
          </span>
        </div>
      </div>
      <div ref={scroller} className="relative min-h-[320px] flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
        {shown.length === 0 && <p className="p-4 text-[13px] text-muted">Waiting for the first message… the two firms log on automatically.</p>}
        {rows.length > RENDER_LIMIT && <p className="px-3 py-1 text-[11px] text-muted">Showing the latest {RENDER_LIMIT} of {rows.length} messages.</p>}
        <ol aria-label="FIX messages in time order">
          {shown.map((row) => {
            const selected = row.id === messages.selectedId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  aria-label={describe(row)}
                  aria-pressed={selected}
                  onClick={() => dispatch(select(row.id))}
                  className="grid w-full grid-cols-[76px_1fr] text-left hover:bg-panel-2"
                  style={selected ? { background: "var(--row-selected)" } : undefined}
                >
                  <span className="px-2 pt-[18px] font-mono text-[11px] text-muted">{time(row.sentAt).slice(0, 12)}</span>
                  <span className="relative block h-11">
                    <span className="absolute inset-y-0 w-px bg-border" style={{ left: LANE_LEFT }} aria-hidden />
                    <span className="absolute inset-y-0 w-px bg-border" style={{ right: LANE_RIGHT }} aria-hidden />
                    <span className="absolute left-1/2 top-[4px] flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap text-[12px]">
                      <span className={`font-mono font-semibold ${row.category === "app" ? "text-app" : "text-admin"}`}>35={row.msgType}</span>
                      <span className={row.category === "app" ? "" : "text-muted"}>{row.msgTypeName}</span>
                      <span className="font-mono text-[11px] text-muted">#{row.seq ?? "?"}</span>
                      {row.possDup && <span className="rounded border border-warn/50 px-1 text-[10px] text-warn">PossDup</span>}
                      {row.delivery === "dropped" && <span className="text-[11px] text-bad">dropped</span>}
                      {row.delivery === "garbled" && <span className="text-[11px] text-bad">garbled · ignored</span>}
                    </span>
                    <Arrow row={row} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
