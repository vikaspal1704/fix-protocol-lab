import { createServer, connect, type Socket } from "node:net";

import { FixSession, type SessionConfig } from "./session.js";
import type { ByteTransport } from "./transport.js";

/** Adapt a TCP socket to the session's byte transport. */
export function socketTransport(socket: Socket): ByteTransport {
  socket.setNoDelay(true);
  return {
    write: (bytes) => {
      if (!socket.destroyed) socket.write(bytes);
    },
    onData: (cb) => socket.on("data", (chunk: Buffer) => cb(new Uint8Array(chunk))),
    onClose: (cb) => socket.on("close", cb),
    close: () => socket.end(),
  };
}

export interface AcceptorHandle {
  readonly port: number;
  /** Resolves with the session once the (single) initiator connects. */
  readonly session: Promise<FixSession>;
  close(): Promise<void>;
}

/**
 * Listen for one initiator on loopback. The host is fixed to 127.0.0.1: FIX
 * sessions in this project are never exposed publicly (API_CONTRACT §7).
 */
export function listenAcceptor(opts: {
  host: "127.0.0.1";
  port: 0;
  config: SessionConfig;
}): Promise<AcceptorHandle> {
  return new Promise((resolveListen, rejectListen) => {
    let resolveSession!: (session: FixSession) => void;
    const session = new Promise<FixSession>((resolve) => (resolveSession = resolve));
    const sockets = new Set<Socket>();

    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      server.close(); // one connection per sandbox
      const fix = new FixSession(opts.config);
      fix.attach(socketTransport(socket));
      resolveSession(fix);
    });
    server.once("error", rejectListen);
    server.listen(opts.port, opts.host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectListen(new Error("unexpected listener address"));
        return;
      }
      resolveListen({
        port: address.port,
        session,
        close: () =>
          new Promise<void>((resolve) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => resolve());
            if (!server.listening) resolve();
          }),
      });
    });
  });
}

export function connectInitiator(opts: {
  host: "127.0.0.1";
  port: number;
  config: SessionConfig;
}): Promise<FixSession> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: opts.host, port: opts.port }, () => {
      socket.off("error", reject);
      const fix = new FixSession(opts.config);
      fix.attach(socketTransport(socket));
      resolve(fix);
    });
    socket.once("error", reject);
  });
}
