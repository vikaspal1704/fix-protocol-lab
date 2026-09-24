import { createSlice } from "@reduxjs/toolkit";

import type { Side, SessionState } from "../../protocol";
import { connect, serverEvent } from "../connection/actions";

export interface SideState {
  state: SessionState;
  reason: string | null;
  nextOutSeq: number | null;
  nextInSeq: number | null;
  pendingFault: string | null;
}

const empty = (): SideState => ({ state: "DISCONNECTED", reason: null, nextOutSeq: null, nextInSeq: null, pendingFault: null });

type State = Record<Side, SideState>;

const sessionSlice = createSlice({
  name: "session",
  initialState: { BUYSIDE: empty(), EXCH: empty() } as State,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(connect, () => ({ BUYSIDE: empty(), EXCH: empty() }))
      .addCase(serverEvent, (state, { payload }) => {
        if (payload.type === "session.state") {
          const side = state[payload.side];
          side.state = payload.state;
          side.reason = payload.reason;
          side.nextOutSeq = payload.nextOutSeq;
          side.nextInSeq = payload.nextInSeq;
        } else if (payload.type === "fault.applied") {
          state[payload.side].pendingFault = payload.kind;
        } else if (payload.type === "fix.message") {
          // Keep sequence numbers live from the wire itself.
          const sender = state[payload.from];
          if (payload.direction === "out" && payload.seq !== null && !payload.possDup) {
            sender.nextOutSeq = Math.max(sender.nextOutSeq ?? 0, payload.seq + 1);
            if (sender.pendingFault === "drop_next" || sender.pendingFault === "corrupt_next_checksum") {
              sender.pendingFault = null;
            }
          }
          if (payload.direction === "in" && payload.seq !== null) {
            const receiver = state[payload.to];
            if (payload.msgType === "4" && payload.fields.some(([t, v]) => t === 123 && v === "Y")) {
              const newSeq = Number(payload.fields.find(([t]) => t === 36)?.[1]);
              if (Number.isInteger(newSeq)) receiver.nextInSeq = Math.max(receiver.nextInSeq ?? 0, newSeq);
            } else if (receiver.nextInSeq === null || payload.seq === receiver.nextInSeq) {
              receiver.nextInSeq = payload.seq + 1;
            }
          }
        }
      });
  },
});

export default sessionSlice.reducer;
