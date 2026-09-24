import { createAction } from "@reduxjs/toolkit";

import type { ClientCommand, ServerEvent } from "../../protocol";

/** Open (or re-open) the sandbox WebSocket for a FIX version. */
export const connect = createAction<{ fixVersion: string }>("ws/connect");
export const sendCommand = createAction<ClientCommand>("ws/send");
export const serverEvent = createAction<ServerEvent>("ws/event");
export const socketOpened = createAction("ws/opened");
export const socketClosed = createAction<{ code: number; retryInMs: number | null }>("ws/closed");
