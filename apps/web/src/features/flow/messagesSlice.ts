import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { FixMessageEvent, Side } from "../../protocol";
import { connect, serverEvent } from "../connection/actions";

export const MAX_ROWS = 2000;

export type Delivery = "in-flight" | "delivered" | "dropped" | "garbled";

/** One row of the sequence diagram: a message from its sender to its receiver. */
export interface FlowRow {
  id: string;
  from: Side;
  to: Side;
  msgType: string;
  msgTypeName: string;
  category: "admin" | "app";
  seq: number | null;
  possDup: boolean;
  fixVersion: string;
  raw: string;
  fields: [number, string][];
  sentAt: number;
  delivery: Delivery;
  note: string | null;
}

interface MessagesState {
  rows: FlowRow[];
  selectedId: string | null;
  hideHeartbeats: boolean;
  hideAdmin: boolean;
  paused: boolean;
  totalSeen: number;
}

const initialState: MessagesState = {
  rows: [],
  selectedId: null,
  hideHeartbeats: false,
  hideAdmin: false,
  paused: false,
  totalSeen: 0,
};

function addEvent(state: MessagesState, e: FixMessageEvent): void {
  if (e.direction === "out") {
    state.totalSeen += 1;
    state.rows.push({
      id: e.id,
      from: e.from,
      to: e.to,
      msgType: e.msgType,
      msgTypeName: e.msgTypeName,
      category: e.category,
      seq: e.seq,
      possDup: e.possDup,
      fixVersion: e.fixVersion,
      raw: e.raw,
      fields: e.fields,
      sentAt: e.at,
      delivery: e.dropped ? "dropped" : "in-flight",
      note: e.note,
    });
    if (state.rows.length > MAX_ROWS) state.rows.splice(0, state.rows.length - MAX_ROWS);
    return;
  }
  // Pair the receive with the earliest unpaired send of the same bytes from the same sender.
  const row = state.rows.find((r) => r.delivery === "in-flight" && r.from === e.from && r.raw === e.raw);
  if (!row) return;
  if (e.note?.startsWith("garbled")) {
    row.delivery = "garbled";
    row.note = e.note;
  } else {
    row.delivery = "delivered";
  }
}

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    select(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleHeartbeats(state) {
      state.hideHeartbeats = !state.hideHeartbeats;
    },
    toggleAdmin(state) {
      state.hideAdmin = !state.hideAdmin;
    },
    togglePaused(state) {
      state.paused = !state.paused;
    },
    clear(state) {
      state.rows = [];
      state.selectedId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(connect, (state) => ({ ...initialState, hideAdmin: state.hideAdmin, hideHeartbeats: state.hideHeartbeats }))
      .addCase(serverEvent, (state, { payload }) => {
        if (payload.type === "fix.message") addEvent(state, payload);
      });
  },
});

export const { select, toggleHeartbeats, toggleAdmin, togglePaused, clear } = messagesSlice.actions;
export default messagesSlice.reducer;

export function visibleRows(state: MessagesState): FlowRow[] {
  return state.rows.filter(
    (r) => !(state.hideAdmin && r.category === "admin") && !(state.hideHeartbeats && (r.msgType === "0" || r.msgType === "1")),
  );
}
