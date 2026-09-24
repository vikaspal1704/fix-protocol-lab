import { getField } from "@fixlab/fix-core";
import { afterEach, describe, expect, it } from "vitest";

import { connectInitiator, listenAcceptor, type AcceptorHandle, type FixSession, type SessionConfig } from "../src/index.js";

const base = { version: "FIX.4.4", heartBtIntSec: 30 } as const;
const acceptorConfig: SessionConfig = { ...base, role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE" };
const initiatorConfig: SessionConfig = { ...base, role: "initiator", senderCompId: "BUYSIDE", targetCompId: "EXCH" };

function until(check: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("condition not met in time"));
      setTimeout(poll, 5);
    };
    poll();
  });
}

let acceptor: AcceptorHandle | null = null;
const sessions: FixSession[] = [];

afterEach(async () => {
  for (const s of sessions.splice(0)) if (s.state !== "DISCONNECTED") s.close("test done");
  await acceptor?.close();
  acceptor = null;
});

async function connectedPair() {
  acceptor = await listenAcceptor({ host: "127.0.0.1", port: 0, config: acceptorConfig });
  const buy = await connectInitiator({ host: "127.0.0.1", port: acceptor.port, config: initiatorConfig });
  const exch = await acceptor.session;
  sessions.push(buy, exch);
  return { buy, exch };
}

describe("tcp transport", () => {
  it("acceptor binds only to loopback on an ephemeral port", async () => {
    acceptor = await listenAcceptor({ host: "127.0.0.1", port: 0, config: acceptorConfig });

    expect(acceptor.port).toBeGreaterThan(0);
    await expect(
      connectInitiator({ host: "127.0.0.1", port: acceptor.port, config: initiatorConfig }).then((s) => {
        sessions.push(s);
        return s.state;
      }),
    ).resolves.toBe("CONNECTED");
  });

  it("initiator and acceptor log on over real TCP", async () => {
    const { buy, exch } = await connectedPair();

    buy.logon();

    await until(() => buy.state === "ACTIVE" && exch.state === "ACTIVE", 1000);
  });

  it("order round trip over real TCP", async () => {
    const { buy, exch } = await connectedPair();
    const reports: string[] = [];
    exch.on("app", (msg) => exch.send("8", [[11, getField(msg, 11)!], [150, "0"], [39, "0"]]));
    buy.on("app", (msg) => reports.push(`${msg.msgType}:${getField(msg, 11)}`));
    buy.logon();
    await until(() => buy.state === "ACTIVE");

    buy.send("D", [[11, "ORD-1"], [55, "DEMO"], [54, "1"], [38, "1"], [40, "1"]]);

    await until(() => reports.length === 1);
    expect(reports).toEqual(["8:ORD-1"]);
  });

  it("socket close moves both sessions to DISCONNECTED", async () => {
    const { buy, exch } = await connectedPair();
    const reasons: string[] = [];
    exch.on("state", (s, r) => s === "DISCONNECTED" && reasons.push(r ?? ""));
    buy.logon();
    await until(() => exch.state === "ACTIVE");

    buy.close("test closes socket");

    await until(() => exch.state === "DISCONNECTED");
    expect(buy.state).toBe("DISCONNECTED");
    expect(reasons).toEqual(["connection closed"]);
  });
});
