import { encode, formatUtcTimestamp, getField, getImplementedVersion, registerVersion } from "@fixlab/fix-core";
import { describe, expect, it } from "vitest";

import { createPipe, FixSession, ManualClock } from "../src/index.js";
import { VECTORS } from "../../fix-core/test/vectors.js";
import { loggedOn, order, pair, raw, T0 } from "./harness.js";

const at = (ms: number) => T0 + ms;
const field = (display: string, tag: number) => new RegExp(`\\|${tag}=([^|]*)\\|`).exec(display)?.[1];

describe("logon", () => {
  it("initiator logon reaches ACTIVE on both sides", () => {
    const { clock, buy, exch } = pair();

    buy.session.logon();
    expect(buy.session.state).toBe("LOGON_SENT");
    clock.advance(2);

    expect(buy.states).toEqual(["CONNECTED", "LOGON_SENT", "ACTIVE:logged on"]);
    expect(exch.states).toEqual(["CONNECTED", "ACTIVE:logged on"]);
    expect(field(exch.sent()[0]!, 108)).toBe("30");
    expect([buy.session.nextInSeq, exch.session.nextInSeq]).toEqual([2, 2]);
  });

  it("first message must be logon", () => {
    const clock = new ManualClock(T0);
    const [a, b] = createPipe(clock);
    const exch = new FixSession({ role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE", version: "FIX.4.4", heartBtIntSec: 30, clock });
    const replies: unknown[] = [];
    exch.attach(b);
    a.onData((chunk) => replies.push(chunk));

    a.write(raw("0", [[49, "BUYSIDE"], [56, "EXCH"], [34, "1"], [52, formatUtcTimestamp(T0)]]));
    clock.advance(5);

    expect(exch.state).toBe("DISCONNECTED");
    expect(replies).toEqual([]);
  });

  it("rejects logon with wrong comp ids", () => {
    const { clock, buy, exch } = pair();
    const wrong = new FixSession({ role: "initiator", senderCompId: "INTRUDER", targetCompId: "EXCH", version: "FIX.4.4", heartBtIntSec: 30, clock });
    // Re-wire: attach the intruder instead of BUYSIDE on a fresh pipe.
    const [a, b] = createPipe(clock);
    const acceptor = new FixSession({ role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE", version: "FIX.4.4", heartBtIntSec: 30, clock });
    const types: string[] = [];
    acceptor.on("wire", (w) => w.direction === "out" && types.push(`${w.msg!.msgType}:${getField(w.msg!, 373) ?? ""}`));
    wrong.attach(a);
    acceptor.attach(b);

    wrong.logon();
    clock.advance(5);

    expect(types).toEqual(["3:9", "5:"]);
    expect(acceptor.state).toBe("DISCONNECTED");
    void buy;
    void exch;
  });

  it("logon times out without reply", () => {
    const clock = new ManualClock(T0);
    const [a] = createPipe(clock);
    const buy = new FixSession({ role: "initiator", senderCompId: "BUYSIDE", targetCompId: "EXCH", version: "FIX.4.4", heartBtIntSec: 30, clock });
    const states: string[] = [];
    buy.on("state", (s, r) => states.push(`${s}:${r}`));
    buy.attach(a);

    buy.logon();
    clock.advance(5000);

    expect(states.at(-1)).toBe("DISCONNECTED:logon timeout");
  });

  it("session uses version profile for logon", () => {
    const { clock, buy } = pair();

    buy.session.logon();
    clock.advance(2);

    expect(buy.sent()[0]).toBe(VECTORS.A1);
    expect(buy.session.profile.session.extraLogonFields).toEqual([]);
  });
});

describe("heartbeats", () => {
  it("sends heartbeat after outbound idle interval", () => {
    const { clock, buy } = loggedOn();

    clock.advance(30_000);

    expect(buy.sentTypes()).toEqual(["A", "0"]);
    expect(buy.session.nextOutSeq).toBe(3);
  });

  it("sends test request after inbound idle and accepts echoed heartbeat", () => {
    const { clock, buy, exch } = loggedOn();
    exch.session.injectFault("pause_heartbeats"); // EXCH goes quiet for 2 x H

    clock.advance(36_100);

    expect(buy.sentTypes()).toContain("1");
    const testReq = buy.wire.find((w) => w.direction === "out" && w.msg!.msgType === "1")!;
    expect(getField(testReq.msg!, 112)).toBe("TEST-1");
    const answer = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "0" && getField(w.msg!, 112) === "TEST-1");
    expect(answer).toBeDefined();
    clock.advance(60_000);
    expect(buy.session.state).toBe("ACTIVE");
  });

  it("disconnects when test request goes unanswered", () => {
    const { clock, buy, pipes } = loggedOn();
    // Stop everything EXCH would send by closing its write side silently.
    (pipes[1] as { write: (b: Uint8Array) => void }).write = () => {};

    clock.advance(36_000 + 30_000 + 10);

    expect(buy.states.at(-1)).toBe("DISCONNECTED:heartbeat timeout");
  });

  it("answers test request with matching TestReqID", () => {
    const { clock, buy, exch } = loggedOn();

    buy.session["sendAdmin"]("1", [[112, "X-42"]]);
    clock.advance(2);

    const reply = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "0")!;
    expect(getField(reply.msg!, 112)).toBe("X-42");
  });

  it("fault pause_heartbeats still answers test requests", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("pause_heartbeats");

    clock.advance(40_000);

    expect(exch.sentTypes()).toContain("1");
    expect(buy.wire.some((w) => w.direction === "out" && w.msg!.msgType === "0" && getField(w.msg!, 112) === "TEST-1")).toBe(true);
    expect([buy.session.state, exch.session.state]).toEqual(["ACTIVE", "ACTIVE"]);
  });
});

describe("sequence numbers and recovery", () => {
  it("sends resend request when inbound seq is too high", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("drop_next");

    buy.session.send("D", order("ORD-1", "1", 10, "101.00", clock.now())); // seq 2 dropped
    buy.session.send("D", order("ORD-2", "1", 10, "101.00", clock.now())); // seq 3 arrives early
    clock.advance(1);

    const resend = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "2")!;
    expect([getField(resend.msg!, 7), getField(resend.msg!, 16)]).toEqual(["2", "0"]);
    expect(exch.session.state).toBe("RESENDING");
    expect(exch.app).toEqual([]);
  });

  it("gap fills admin messages during resend", () => {
    const { clock, buy, exch } = loggedOn();
    clock.advanceTo(at(5000));
    buy.session.injectFault("drop_next");
    clock.advanceTo(at(35_000)); // heartbeat seq 2 dropped

    buy.session.send("D", order("ORD-2", "2", 10, "102.00", clock.now()));
    clock.advance(3);

    const replay = buy.wire.filter((w) => w.direction === "out" && w.possDup).map((w) => w.msg!);
    expect(replay.map((m) => [m.msgType, getField(m, 34), getField(m, 36) ?? null])).toEqual([
      ["4", "2", "3"],
      ["D", "3", null],
    ]);
    const dropped = buy.wire.find((w) => w.dropped)!;
    expect(getField(replay[0]!, 122)).toBe(formatUtcTimestamp(dropped.at));
    expect(exch.app).toEqual(["D"]);
  });

  it("collapses consecutive admin messages into one gap fill", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("drop_next");
    clock.advance(30_000); // heartbeat seq 2 dropped
    buy.session["sendAdmin"]("0", []); // seq 3 — arrives, EXCH asks from 2
    clock.advance(1);
    buy.session.send("D", order("ORD-9", "1", 1, "100.00", clock.now()));
    clock.advance(5);

    const fills = buy.wire.filter((w) => w.direction === "out" && w.msg!.msgType === "4");
    expect(fills.map((w) => [getField(w.msg!, 34), getField(w.msg!, 36)])).toEqual([["2", "4"]]);
    expect(exch.session.state).toBe("ACTIVE");
    expect(exch.session.nextInSeq).toBe(buy.session.nextOutSeq);
  });

  it("resends application messages with PossDupFlag and OrigSendingTime", () => {
    const { clock, buy } = loggedOn();
    buy.session.injectFault("drop_next");
    const sentAt = clock.now();
    buy.session.send("D", order("ORD-1", "1", 5, "100.00", sentAt)); // seq 2 dropped
    clock.advance(10);
    buy.session.send("D", order("ORD-2", "1", 5, "100.00", clock.now())); // seq 3 → gap
    clock.advance(3);

    const resent = buy.wire.find((w) => w.direction === "out" && w.possDup && w.msg!.msgType === "D")!.msg!;
    expect(getField(resent, 34)).toBe("2");
    expect(getField(resent, 43)).toBe("Y");
    expect(getField(resent, 122)).toBe(formatUtcTimestamp(sentAt));
    expect(getField(resent, 52)).not.toBe(formatUtcTimestamp(sentAt));
  });

  it("returns to ACTIVE after gap is filled", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("drop_next");
    buy.session.send("D", order("ORD-1", "1", 5, "100.00", clock.now()));
    buy.session.send("D", order("ORD-2", "1", 5, "100.00", clock.now()));
    clock.advance(5);

    expect(exch.states.slice(-2)).toEqual(["RESENDING:gap: expected 2, received 3", "ACTIVE:gap filled"]);
    expect(exch.session.nextInSeq).toBe(buy.session.nextOutSeq);
    expect(exch.app).toEqual(["D", "D"]);
  });

  it("ignores possdup messages below expected seq", () => {
    const { clock, buy, exch, pipes } = loggedOn();
    buy.session.send("D", order("ORD-1", "1", 5, "100.00", clock.now()));
    clock.advance(2);

    pipes[0].write(raw("D", [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"], [52, formatUtcTimestamp(clock.now())], [43, "Y"], [122, formatUtcTimestamp(T0)], [11, "ORD-1"]]));
    clock.advance(2);

    expect(exch.session.state).toBe("ACTIVE");
    expect(exch.app).toEqual(["D"]);
    void buy;
  });

  it("logs out when inbound seq is too low without possdup", () => {
    const { clock, exch, pipes } = loggedOn();
    clock.advance(1);

    pipes[0].write(raw("0", [[49, "BUYSIDE"], [56, "EXCH"], [34, "1"], [52, formatUtcTimestamp(clock.now())]]));
    clock.advance(2);

    const logout = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "5")!;
    expect(getField(logout.msg!, 58)).toBe("MsgSeqNum too low, expecting 2 but received 1");
    expect(exch.session.state).toBe("DISCONNECTED");
  });

  it("drops garbled messages without advancing sequence", () => {
    const { clock, buy, exch } = loggedOn();
    const before = exch.session.nextInSeq;
    buy.session.injectFault("corrupt_next_checksum");

    buy.session["sendAdmin"]("0", []);
    clock.advance(1);

    const garbled = exch.wire.find((w) => w.direction === "in" && w.msg === null)!;
    expect(garbled.note).toBe("garbled: BAD_CHECKSUM (ignored)");
    expect(exch.session.nextInSeq).toBe(before);
    expect(exch.sentTypes()).not.toContain("3");
  });

  it("rejects message missing required header tag", () => {
    const { clock, exch, pipes } = loggedOn();

    pipes[0].write(raw("0", [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"]]));
    clock.advance(1);

    const reject = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "3")!.msg!;
    expect([getField(reject, 45), getField(reject, 371), getField(reject, 373)]).toEqual(["2", "52", "1"]);
    expect(exch.session.nextInSeq).toBe(3);
  });

  it("applies sequence reset in reset mode", () => {
    const { clock, exch, pipes } = loggedOn();

    pipes[0].write(raw("4", [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"], [52, formatUtcTimestamp(clock.now())], [123, "N"], [36, "10"]]));
    clock.advance(1);

    expect(exch.session.nextInSeq).toBe(10);
  });

  it("rejects gap fill that lowers sequence", () => {
    const { clock, exch, pipes } = loggedOn();

    pipes[0].write(raw("4", [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"], [52, formatUtcTimestamp(clock.now())], [123, "Y"], [36, "2"]]));
    clock.advance(1);

    const reject = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "3")!.msg!;
    expect(getField(reject, 373)).toBe("5");
    expect(exch.session.nextInSeq).toBe(2);
  });

  it("fault drop_next consumes seq and triggers peer recovery", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("drop_next");

    clock.advance(30_000); // heartbeat dropped
    buy.session.send("D", order("ORD-2", "2", 10, "102.00", clock.now()));
    clock.advance(5);

    expect(buy.wire.find((w) => w.dropped)?.seq).toBe(2);
    expect([buy.session.state, exch.session.state]).toEqual(["ACTIVE", "ACTIVE"]);
    expect(exch.session.nextInSeq).toBe(buy.session.nextOutSeq);
  });

  it("fault corrupt_next_checksum triggers recovery", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.injectFault("corrupt_next_checksum");

    buy.session.send("D", order("ORD-1", "1", 5, "100.00", clock.now()));
    buy.session.send("D", order("ORD-2", "1", 5, "100.00", clock.now()));
    clock.advance(5);

    expect(exch.wire.some((w) => w.note?.startsWith("garbled"))).toBe(true);
    expect(exch.sentTypes()).toContain("2");
    expect(exch.app).toEqual(["D", "D"]);
    expect(exch.session.state).toBe("ACTIVE");
  });

  it("queues new outbound messages during resend replay", () => {
    const { clock, buy, exch } = loggedOn();
    buy.session.on("wire", (w) => {
      // Send a new order while the GapFill is being written, i.e. mid-replay.
      if (w.direction === "out" && w.msg!.msgType === "4" && buy.app.length === 0) {
        buy.app.push("sent-mid-replay");
        buy.session.send("D", order("ORD-LATE", "1", 1, "100.00", clock.now()));
      }
    });
    buy.session.injectFault("drop_next");
    clock.advance(30_000);
    buy.session.send("D", order("ORD-2", "1", 1, "100.00", clock.now()));
    clock.advance(5);

    const seqs = buy.wire.filter((w) => w.direction === "out" && !w.dropped).map((w) => [w.msg!.msgType, w.seq, w.possDup]);
    expect(seqs.slice(-3)).toEqual([["4", 2, true], ["D", 3, true], ["D", 4, false]]);
    expect(exch.session.nextInSeq).toBe(5);
  });

  it("logs out on incorrect begin string", () => {
    const { clock, exch, pipes } = loggedOn();
    registerVersion({ ...getImplementedVersion("FIX.4.4"), id: "FIX.9.8", label: "Test", beginString: "FIX.9.8", order: 998 });
    const other = encode({ beginString: "FIX.9.8", msgType: "0", fields: [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"], [52, formatUtcTimestamp(clock.now())]] });

    pipes[0].write(other);
    clock.advance(1);

    const logout = exch.wire.find((w) => w.direction === "out" && w.msg!.msgType === "5")!;
    expect(getField(logout.msg!, 58)).toBe("Incorrect BeginString");
    expect(exch.session.state).toBe("DISCONNECTED");
  });

  it("treats unimplemented begin strings as garbled", () => {
    const { clock, exch, pipes } = loggedOn();

    pipes[0].write(new TextEncoder().encode("8=FIX.4.2\x019=5\x0135=0\x0110=000\x01"));
    clock.advance(1);

    expect(exch.wire.at(-1)!.note).toBe("garbled: UNKNOWN_VERSION (ignored)");
    expect(exch.session.state).toBe("ACTIVE");
  });

  it("logout handshake closes cleanly", () => {
    const { clock, buy, exch } = loggedOn();

    buy.session.logout("bye");
    clock.advance(5);

    expect(buy.states.at(-1)).toBe("DISCONNECTED:logout complete");
    expect(exch.states.at(-1)).toBe("DISCONNECTED:peer logged out");
  });
});

describe("worked examples", () => {
  it("worked example A produces golden vectors A1 to A4", () => {
    const { clock, buy, exch } = pair();
    exch.session.on("app", (msg) => {
      if (getField(msg, 11) === "ORD-1") {
        exch.session.send("8", [[37, "EX-1"], [11, "ORD-1"], [17, "EXEC-1"], [150, "0"], [39, "0"], [55, "DEMO"], [54, "1"], [38, "100"], [44, "101.25"], [151, "100"], [14, "0"], [6, "0"]]);
      }
    });

    buy.session.logon(); // 10:00:00.000
    clock.advanceTo(at(5000));
    buy.session.send("D", order("ORD-1", "1", 100, "101.25", clock.now()));
    clock.advance(2);

    expect(buy.sent().slice(0, 2)).toEqual([VECTORS.A1, VECTORS.A3]);
    expect(exch.sent().slice(0, 2)).toEqual([VECTORS.A2, VECTORS.A4]);
  });

  it("worked example B recovers a dropped heartbeat with golden vectors B1 to B5", () => {
    const { clock, buy, exch } = pair();
    let execId = 0;
    exch.session.on("app", (msg) => {
      const id = getField(msg, 11)!;
      execId += 1;
      exch.session.send("8", [[37, `EX-${execId}`], [11, id], [17, `EXEC-${execId}`], [150, "0"], [39, "0"]]);
      if (id === "ORD-1") {
        clock.setTimeout(() => exch.session.send("8", [[11, id], [150, "F"], [39, "1"]]), 250);
        clock.setTimeout(() => exch.session.send("8", [[11, id], [150, "F"], [39, "2"]]), 500);
      }
    });
    buy.session.logon();
    clock.advanceTo(at(5000));
    buy.session.send("D", order("ORD-1", "1", 100, "101.25", clock.now()));
    clock.advanceTo(at(20_000));
    buy.session.injectFault("drop_next");

    clock.advanceTo(at(35_400)); // heartbeat seq 3 dropped at 35.000
    buy.session.send("D", order("ORD-2", "2", 10, "102.00", clock.now()));
    clock.advance(5);

    const dropped = buy.wire.find((w) => w.dropped)!;
    expect(new TextDecoder().decode(dropped.raw).replaceAll("\x01", "|")).toBe(VECTORS.B1);
    expect(buy.sent().slice(-3)).toEqual([VECTORS.B2, VECTORS.B4, VECTORS.B5]);
    expect(exch.sent()).toContain(VECTORS.B3);
    expect([buy.session.state, exch.session.state]).toEqual(["ACTIVE", "ACTIVE"]);
    expect(exch.app).toEqual(["D", "D"]);
  });
});
