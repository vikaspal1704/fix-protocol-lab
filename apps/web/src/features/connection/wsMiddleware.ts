import type { Middleware } from "@reduxjs/toolkit";

import type { ServerEvent } from "../../protocol";
import { connect, sendCommand, serverEvent, socketClosed, socketOpened } from "./actions";

export const MIN_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 10_000;

export function wsUrl(fixVersion: string, location: Location = window.location): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws?fixVersion=${encodeURIComponent(fixVersion)}`;
}

/**
 * Owns the WebSocket: components only dispatch actions. Reconnects with
 * exponential backoff unless the server refused the version (1008).
 */
export const wsMiddleware: Middleware = (store) => {
  let socket: WebSocket | null = null;
  let backoff = MIN_BACKOFF_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let fixVersion = "FIX.4.4";

  const open = () => {
    clearTimeout(retryTimer);
    const ws = new WebSocket(wsUrl(fixVersion));
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      backoff = MIN_BACKOFF_MS;
      store.dispatch(socketOpened());
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      if (socket !== ws) return;
      store.dispatch(serverEvent(JSON.parse(event.data) as ServerEvent));
    };
    ws.onclose = (event: CloseEvent) => {
      if (socket !== ws) return; // replaced by a newer connection
      socket = null;
      const retry = event.code === 1008 ? null : backoff;
      store.dispatch(socketClosed({ code: event.code, retryInMs: retry }));
      if (retry !== null) {
        retryTimer = setTimeout(open, retry);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    };
  };

  return (next) => (action) => {
    if (connect.match(action)) {
      const result = next(action);
      fixVersion = action.payload.fixVersion;
      backoff = MIN_BACKOFF_MS;
      const old = socket;
      socket = null;
      old?.close(1000, "switching");
      open();
      return result;
    }
    if (sendCommand.match(action)) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(action.payload));
      return next(action);
    }
    return next(action);
  };
};
