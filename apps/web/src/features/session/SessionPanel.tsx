import { useAppDispatch, useAppSelector } from "../../app/store";
import { Chip } from "../../components/Panel";
import type { FaultKind, Side } from "../../protocol";
import { sendCommand } from "../connection/actions";

const FAULTS: { kind: FaultKind; label: string; help: string }[] = [
  { kind: "drop_next", label: "Drop next message", help: "The next message this side sends is lost in transit. The receiver sees a sequence gap and asks for a resend." },
  { kind: "pause_heartbeats", label: "Pause heartbeats", help: "This side stops sending regular heartbeats for 2 × HeartBtInt. The other side notices the silence and sends a TestRequest." },
  { kind: "corrupt_next_checksum", label: "Corrupt next checksum", help: "The next message arrives with a wrong CheckSum (10). The receiver ignores it as garbled, then recovers through the gap." },
];

const TONE = { ACTIVE: "ok", RESENDING: "warn", LOGON_SENT: "warn", LOGOUT_SENT: "warn", CONNECTED: "warn", DISCONNECTED: "bad" } as const;

function SideCard({ side }: { side: Side }) {
  const dispatch = useAppDispatch();
  const s = useAppSelector((st) => st.session[side]);
  const live = s.state === "ACTIVE" || s.state === "RESENDING";

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{side}</div>
          <div className="text-[12px] text-muted">{side === "BUYSIDE" ? "initiator · sends orders" : "acceptor · simulated exchange"}</div>
        </div>
        <Chip tone={TONE[s.state]}>
          <span aria-hidden>●</span> {s.state}
        </Chip>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded bg-panel-2 px-2 py-1">
          <dt className="text-muted">Next out MsgSeqNum</dt>
          <dd className="font-mono text-[15px]" data-testid={`${side}-out`}>{s.nextOutSeq ?? "–"}</dd>
        </div>
        <div className="rounded bg-panel-2 px-2 py-1">
          <dt className="text-muted">Expecting in</dt>
          <dd className="font-mono text-[15px]" data-testid={`${side}-in`}>{s.nextInSeq ?? "–"}</dd>
        </div>
      </dl>
      {s.reason && <p className="mt-2 text-[12px] text-muted">Last change: {s.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FAULTS.map((f) => (
          <button
            key={f.kind}
            type="button"
            disabled={!live}
            title={f.help}
            onClick={() => dispatch(sendCommand({ type: "fault.inject", side, kind: f.kind }))}
            className={`rounded-md border px-2 py-1 text-[12px] disabled:opacity-50 ${
              s.pendingFault === f.kind ? "border-warn text-warn" : "border-border hover:bg-panel-2"
            }`}
          >
            {s.pendingFault === f.kind ? `Armed: ${f.label.toLowerCase()}` : f.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!live}
          onClick={() => dispatch(sendCommand({ type: "session.logout", side }))}
          className="rounded-md border border-border px-2 py-1 text-[12px] hover:bg-panel-2 disabled:opacity-50"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export function SessionPanel() {
  const dispatch = useAppDispatch();
  const bothDown = useAppSelector((s) => s.session.BUYSIDE.state === "DISCONNECTED" && s.session.EXCH.state === "DISCONNECTED");
  const open = useAppSelector((s) => s.connection.status === "open" && s.connection.hello !== null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SideCard side="BUYSIDE" />
        <SideCard side="EXCH" />
      </div>
      {open && bothDown && (
        <button
          type="button"
          onClick={() => dispatch(sendCommand({ type: "session.logon" }))}
          className="self-start rounded-md bg-accent px-3 py-1.5 text-[13px] text-accent-text"
        >
          Connect and log on again
        </button>
      )}
    </div>
  );
}
