import { createSlice } from "@reduxjs/toolkit";

import type { HelloEvent } from "../../protocol";
import { connect, serverEvent, socketClosed, socketOpened } from "./actions";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

interface ConnectionState {
  status: ConnectionStatus;
  fixVersion: string;
  hello: HelloEvent | null;
  retryInMs: number | null;
  lastError: { code: string; message: string } | null;
  autoplay: boolean;
}

const initialState: ConnectionState = {
  status: "idle",
  fixVersion: "FIX.4.4",
  hello: null,
  retryInMs: null,
  lastError: null,
  autoplay: false,
};

const connectionSlice = createSlice({
  name: "connection",
  initialState,
  reducers: {
    dismissError(state) {
      state.lastError = null;
    },
    setAutoplay(state, action: { payload: boolean }) {
      state.autoplay = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(connect, (state, { payload }) => {
        state.status = "connecting";
        state.fixVersion = payload.fixVersion;
        state.hello = null;
        state.retryInMs = null;
        state.autoplay = false;
      })
      .addCase(socketOpened, (state) => {
        state.status = "open";
        state.retryInMs = null;
      })
      .addCase(socketClosed, (state, { payload }) => {
        state.status = payload.retryInMs === null ? "closed" : "reconnecting";
        state.retryInMs = payload.retryInMs;
        state.autoplay = false;
      })
      .addCase(serverEvent, (state, { payload }) => {
        if (payload.type === "hello") {
          state.hello = payload;
          state.fixVersion = payload.fixVersion;
        } else if (payload.type === "error") {
          state.lastError = { code: payload.code, message: payload.message };
        }
      });
  },
});

export const { dismissError, setAutoplay } = connectionSlice.actions;
export default connectionSlice.reducer;
