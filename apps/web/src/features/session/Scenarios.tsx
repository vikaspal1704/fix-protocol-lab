import { useEffect, useRef, useState } from "react";

import type { AppDispatch } from "../../app/store";
import { useAppDispatch, useAppSelector } from "../../app/store";
import { sendCommand } from "../connection/actions";
import { setAutoplay } from "../connection/connectionSlice";

export type ScenarioId = "gap-recovery" | "test-request" | "bad-checksum";

export const SCENARIOS: { id: ScenarioId; label: string; watch: string }[] = [
  {
    id: "gap-recovery",
    label: "Lose a message",
    watch:
      "BUYSIDE's next order is dropped in transit (✕). Its following message arrives with a higher MsgSeqNum, so EXCH sends ResendRequest (35=2). BUYSIDE replays the order marked PossDup, skipping admin messages with SequenceReset-GapFill (35=4).",
  },
  {
    id: "test-request",
    label: "Go quiet",
    watch:
      "BUYSIDE stops sending heartbeats. After about 1.2 × HeartBtInt of silence, EXCH sends a TestRequest (35=1) and BUYSIDE answers with a Heartbeat echoing the same TestReqID (112), so the session stays up.",
  },
  {
    id: "bad-checksum",
    label: "Corrupt a checksum",
    watch:
      "The next order arrives with a wrong CheckSum (10). EXCH ignores it as garbled, without advancing its expected MsgSeqNum. The next message reveals the gap and the normal resend recovery follows.",
  },
];

export function runScenario(dispatch: AppDispatch, id: ScenarioId): void {
  const order = (side: "BUY" | "SELL", price: string) =>
    dispatch(sendCommand({ type: "order.new", symbol: "DEMO", side, qty: 10, ordType: "LIMIT", price }));
  if (id === "gap-recovery") {
    dispatch(sendCommand({ type: "fault.inject", side: "BUYSIDE", kind: "drop_next" }));
    order("BUY", "101.25");
    setTimeout(() => order("SELL", "105.00"), 400);
  } else if (id === "bad-checksum") {
    dispatch(sendCommand({ type: "fault.inject", side: "BUYSIDE", kind: "corrupt_next_checksum" }));
    order("BUY", "101.25");
    setTimeout(() => order("SELL", "105.00"), 400);
  } else {
    dispatch(sendCommand({ type: "fault.inject", side: "BUYSIDE", kind: "pause_heartbeats" }));
  }
}

export function Scenarios() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.session.BUYSIDE.state === "ACTIVE" && s.session.EXCH.state === "ACTIVE");
  const autoplay = useAppSelector((s) => s.connection.autoplay);
  const [current, setCurrent] = useState<ScenarioId | null>(null);
  const fromUrl = useRef(new URLSearchParams(window.location.search).get("scenario") as ScenarioId | null);

  // ?scenario=gap-recovery runs once as soon as both sides are logged on.
  useEffect(() => {
    const id = fromUrl.current;
    if (active && id && SCENARIOS.some((s) => s.id === id)) {
      fromUrl.current = null;
      setCurrent(id);
      runScenario(dispatch, id);
    }
  }, [active, dispatch]);

  const info = SCENARIOS.find((s) => s.id === current);
  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold">Try it:</span>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!active}
            onClick={() => {
              setCurrent(s.id);
              runScenario(dispatch, s.id);
            }}
            className="rounded-md border border-border px-2 py-1 text-[12px] hover:bg-panel-2 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px]">
          <input
            type="checkbox"
            checked={autoplay}
            disabled={!active && !autoplay}
            onChange={(e) => {
              dispatch(setAutoplay(e.target.checked));
              dispatch(sendCommand({ type: "autoplay.set", on: e.target.checked }));
            }}
          />
          Autoplay orders
        </label>
      </div>
      {info && <p className="mt-2 text-[12px] text-muted" aria-live="polite"><span className="font-semibold text-text">What to watch: </span>{info.watch}</p>}
    </div>
  );
}
