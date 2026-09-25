import {
  computeCheckSum,
  decode,
  encode,
  FixFramer,
  FixParseError,
  formatUtcTimestamp,
  getField,
  getImplementedVersion,
  type FixField,
  type FixMessage,
  type ImplementedProfile,
} from "@fixlab/fix-core";

import { systemClock, type Clock } from "./clock.js";
import { Emitter } from "./emitter.js";
import { MessageStore } from "./store.js";
import type { ByteTransport } from "./transport.js";

export type SessionRole = "initiator" | "acceptor";
export type SessionState =
  | "DISCONNECTED"
  | "CONNECTED"
  | "LOGON_SENT"
  | "ACTIVE"
  | "RESENDING"
  | "LOGOUT_SENT";
export type FaultKind = "drop_next" | "pause_heartbeats" | "corrupt_next_checksum";

export interface SessionConfig {
  readonly role: SessionRole;
  readonly senderCompId: string;
  readonly targetCompId: string;
  /** Registered and implemented version id, e.g. "FIX.4.4". */
  readonly version: string;
  /** HeartBtInt (108), in seconds. */
  readonly heartBtIntSec: number;
  readonly clock?: Clock;
  readonly logonTimeoutMs?: number;
  readonly logoutTimeoutMs?: number;
}

export interface WireEvent {
  readonly direction: "out" | "in";
  readonly raw: Uint8Array;
  /** null if the bytes failed to decode. */
  readonly msg: FixMessage | null;
  readonly seq: number | null;
  readonly possDup: boolean;
  /** true when a fault swallowed it (out only). */
  readonly dropped: boolean;
  readonly note: string | null;
  readonly at: number;
}

export type SessionEvents = {
  state: [state: SessionState, reason: string | null];
  wire: [event: WireEvent];
  app: [msg: FixMessage];
  error: [err: Error];
};

// Header tags every message must carry (API_CONTRACT §1).
const REQUIRED_HEADER = [49, 56, 34, 52] as const;
const INBOUND_IDLE_FACTOR = 1.2;

interface SendOptions {
  /** Resend: reuse this MsgSeqNum and mark PossDupFlag=Y. */
  readonly resendOf?: { seq: number; origSendingTime: string };
}

export class FixSession extends Emitter<SessionEvents> {
  readonly role: SessionRole;
  readonly profile: ImplementedProfile;
  private readonly config: SessionConfig;
  private readonly clock: Clock;
  private readonly store = new MessageStore();
  private framer = new FixFramer();
  private transport: ByteTransport | null = null;

  private _state: SessionState = "DISCONNECTED";
  private _nextOutSeq = 1;
  private _nextInSeq = 1;
  /** Heartbeat interval in effect (the acceptor adopts the initiator's). */
  private heartBtIntSec: number;

  // Gap recovery
  private highestSeenSeq = 0;
  private replaying = false;
  private readonly outboundQueue: [string, FixField[]][] = [];

  // Timers
  private outboundTimer: unknown = null;
  private inboundTimer: unknown = null;
  private testRequestTimer: unknown = null;
  private logonTimer: unknown = null;
  private logoutTimer: unknown = null;
  private testRequestCounter = 0;

  // Faults
  private dropNext = false;
  private corruptNext = false;
  private heartbeatsPausedUntil = 0;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
    this.role = config.role;
    this.profile = getImplementedVersion(config.version);
    this.clock = config.clock ?? systemClock;
    this.heartBtIntSec = config.heartBtIntSec;
  }

  get state(): SessionState {
    return this._state;
  }

  get nextOutSeq(): number {
    return this._nextOutSeq;
  }

  get nextInSeq(): number {
    return this._nextInSeq;
  }

  get senderCompId(): string {
    return this.config.senderCompId;
  }

  get targetCompId(): string {
    return this.config.targetCompId;
  }

  /** Attach a byte transport (TCP socket in production, in-memory pipe in tests). */
  attach(transport: ByteTransport): void {
    this.transport = transport;
    this.framer = new FixFramer();
    transport.onData((chunk) => this.onBytes(chunk));
    transport.onClose(() => this.disconnect("connection closed", false));
    this.setState("CONNECTED");
  }

  /** Initiator only: open the session with Logon (A). */
  logon(): void {
    if (this.role !== "initiator") throw new Error("only the initiator sends the first Logon");
    if (this._state !== "CONNECTED") throw new Error(`cannot log on in state ${this._state}`);
    // FIX: ResetSeqNumFlag=Y restarts both sides' sequence numbers at 1.
    this.resetSequences();
    this.sendAdmin("A", this.logonFields());
    this.setState("LOGON_SENT");
    this.logonTimer = this.clock.setTimeout(
      () => this.disconnect("logon timeout"),
      this.config.logonTimeoutMs ?? 5000,
    );
  }

  logout(text?: string): void {
    if (this._state === "DISCONNECTED" || this._state === "LOGOUT_SENT") return;
    this.sendAdmin("5", text ? [[58, text]] : []);
    this.setState("LOGOUT_SENT");
    this.logoutTimer = this.clock.setTimeout(
      () => this.disconnect("logout timeout"),
      this.config.logoutTimeoutMs ?? 2000,
    );
  }

  /** Drop the connection immediately, without a Logout handshake. */
  close(reason = "closed"): void {
    this.disconnect(reason);
  }

  /** Send an application message; header and trailer are filled in. Returns its MsgSeqNum. */
  send(msgType: string, fields: readonly FixField[]): number {
    if (this._state !== "ACTIVE" && this._state !== "RESENDING") {
      throw new Error(`cannot send ${msgType} in state ${this._state}`);
    }
    if (this.replaying) {
      // FIX: keep MsgSeqNum monotonic on the wire; new messages wait for the replay to finish.
      this.outboundQueue.push([msgType, [...fields]]);
      return this._nextOutSeq + this.outboundQueue.length - 1;
    }
    return this.sendMessage(msgType, fields);
  }

  injectFault(kind: FaultKind): void {
    if (kind === "drop_next") this.dropNext = true;
    else if (kind === "corrupt_next_checksum") this.corruptNext = true;
    else this.heartbeatsPausedUntil = this.clock.now() + 2 * this.heartBtIntSec * 1000;
  }

  // ---------------------------------------------------------------- outbound

  private logonFields(): FixField[] {
    return [
      [98, "0"],
      [108, String(this.heartBtIntSec)],
      [141, "Y"],
      ...this.profile.session.extraLogonFields,
    ];
  }

  private isAdmin(msgType: string): boolean {
    return this.profile.session.adminMsgTypes.includes(msgType);
  }

  private sendAdmin(msgType: string, fields: readonly FixField[]): number {
    return this.sendMessage(msgType, fields);
  }

  private sendMessage(msgType: string, fields: readonly FixField[], opts: SendOptions = {}): number {
    const now = this.clock.now();
    const sendingTime = formatUtcTimestamp(now);
    const seq = opts.resendOf?.seq ?? this._nextOutSeq;
    const header: FixField[] = [
      [49, this.config.senderCompId],
      [56, this.config.targetCompId],
      [34, String(seq)],
      [52, sendingTime],
    ];
    if (opts.resendOf) header.push([43, "Y"], [122, opts.resendOf.origSendingTime]);
    const msg: FixMessage = {
      beginString: this.profile.beginString,
      msgType,
      fields: [...header, ...fields],
    };

    if (!opts.resendOf) {
      this._nextOutSeq += 1;
      this.store.add({ seq, msgType, fields: [...fields], sendingTime, admin: this.isAdmin(msgType) });
    }

    let raw = encode(msg);
    let note: string | null = null;
    let dropped = false;
    if (this.dropNext) {
      this.dropNext = false;
      dropped = true;
      note = "dropped in transit (fault)";
    } else if (this.corruptNext) {
      this.corruptNext = false;
      const good = computeCheckSum(raw.subarray(0, raw.length - 7));
      raw = encode(msg, { overrideCheckSum: String((Number(good) + 1) % 256).padStart(3, "0") });
      note = "checksum corrupted (fault)";
    }

    this.emit("wire", {
      direction: "out",
      raw,
      msg,
      seq,
      possDup: Boolean(opts.resendOf),
      dropped,
      note,
      at: now,
    });
    if (!dropped) this.transport?.write(raw);
    this.scheduleOutboundHeartbeat();
    return seq;
  }

  // ----------------------------------------------------------------- inbound

  private onBytes(chunk: Uint8Array): void {
    let frames: Uint8Array[];
    try {
      frames = this.framer.push(chunk);
    } catch (err) {
      this.emit("error", err as Error);
      return;
    }
    for (const raw of frames) {
      if (this._state === "DISCONNECTED") return;
      this.onFrame(raw);
    }
  }

  private onFrame(raw: Uint8Array): void {
    const now = this.clock.now();
    let msg: FixMessage;
    try {
      msg = decode(raw);
    } catch (err) {
      const code = err instanceof FixParseError ? err.code : "UNDECODABLE";
      // FIX: garbled messages are ignored — no Reject, and MsgSeqNum is not advanced.
      this.emit("wire", {
        direction: "in",
        raw,
        msg: null,
        seq: null,
        possDup: false,
        dropped: false,
        note: `garbled: ${code} (ignored)`,
        at: now,
      });
      this.onAnyInbound();
      return;
    }

    const seqText = getField(msg, 34);
    const seq = seqText !== undefined && /^\d+$/.test(seqText) ? Number(seqText) : null;
    const possDup = getField(msg, 43) === "Y";
    this.emit("wire", { direction: "in", raw, msg, seq, possDup, dropped: false, note: null, at: now });
    this.onAnyInbound();

    if (msg.beginString !== this.profile.beginString) {
      this.logoutAndDisconnect("Incorrect BeginString");
      return;
    }

    // FIX: the first message on a new connection must be Logon.
    if (this._state === "CONNECTED") {
      if (this.role !== "acceptor" || msg.msgType !== "A") {
        this.disconnect("first message was not Logon");
        return;
      }
      this.acceptLogon(msg, seq);
      return;
    }

    if (seq === null) {
      this.logoutAndDisconnect("MsgSeqNum (34) missing or invalid");
      return;
    }

    const missing = REQUIRED_HEADER.find((tag) => getField(msg, tag) === undefined);
    if (missing !== undefined && seq === this._nextInSeq) {
      // FIX: well-formed message missing a required header tag → Reject (373=1), consume the seq.
      this._nextInSeq += 1;
      this.sendReject(seq, msg.msgType, 1, missing, `Required tag ${missing} missing`);
      return;
    }

    if (msg.msgType === "4" && getField(msg, 123) !== "Y") {
      this.applySequenceReset(msg, seq); // Reset mode ignores MsgSeqNum
      return;
    }

    if (seq > this._nextInSeq) {
      // FIX: too high → ask for everything from the gap onward and don't process this message.
      this.highestSeenSeq = Math.max(this.highestSeenSeq, seq);
      if (this._state !== "RESENDING") {
        this.setState("RESENDING", `gap: expected ${this._nextInSeq}, received ${seq}`);
        this.sendAdmin("2", [
          [7, String(this._nextInSeq)],
          [16, "0"],
        ]);
      }
      if (msg.msgType === "2") this.answerResendRequest(msg); // still honour the peer's request
      return;
    }

    if (seq < this._nextInSeq) {
      // FIX: too low with PossDupFlag=Y is a harmless duplicate; without it the session is broken.
      if (!possDup) {
        this.logoutAndDisconnect(
          `MsgSeqNum too low, expecting ${this._nextInSeq} but received ${seq}`,
        );
      }
      return;
    }

    this.processInSequence(msg, seq);
    if (this._state === "RESENDING" && this._nextInSeq > this.highestSeenSeq) {
      this.setState("ACTIVE", "gap filled");
    }
  }

  private processInSequence(msg: FixMessage, seq: number): void {
    if (msg.msgType === "4") {
      // SequenceReset-GapFill: jump to NewSeqNo.
      const newSeq = Number(getField(msg, 36));
      if (!Number.isInteger(newSeq) || newSeq <= this._nextInSeq) {
        this.sendReject(seq, "4", 5, 36, "NewSeqNo must be greater than the expected MsgSeqNum");
        return;
      }
      this._nextInSeq = newSeq;
      return;
    }

    this._nextInSeq += 1;
    switch (msg.msgType) {
      case "A":
        if (this._state === "LOGON_SENT") {
          this.clock.clearTimeout(this.logonTimer);
          this.setState("ACTIVE", "logged on");
          this.scheduleOutboundHeartbeat();
        }
        return;
      case "0":
        return; // Heartbeat: receiving it already reset the inbound timers
      case "1":
        // FIX: answer a TestRequest immediately, echoing TestReqID (112).
        {
          const testReqId = getField(msg, 112);
          this.sendAdmin("0", testReqId === undefined ? [] : [[112, testReqId]]);
        }
        return;
      case "2":
        this.answerResendRequest(msg);
        return;
      case "3":
        return; // Reject: surfaced through the wire event
      case "5":
        if (this._state === "LOGOUT_SENT") {
          this.disconnect("logout complete");
        } else {
          this.sendAdmin("5", []);
          this.disconnect("peer logged out");
        }
        return;
      default:
        this.emit("app", msg);
    }
  }

  private acceptLogon(msg: FixMessage, seq: number | null): void {
    // FIX: the acceptor checks CompIDs from its own point of view.
    if (getField(msg, 49) !== this.config.targetCompId || getField(msg, 56) !== this.config.senderCompId) {
      this.resetSequences();
      this.sendReject(seq ?? 1, "A", 9, 49, "CompID problem");
      this.logoutAndDisconnect("CompID problem");
      return;
    }
    // Version-specific Logon fields (e.g. FIXT DefaultApplVerID 1137) must match this profile.
    for (const [tag, expected] of this.profile.session.extraLogonFields) {
      const value = getField(msg, tag);
      if (value === expected) continue;
      const text = value === undefined ? `Required tag ${tag} missing` : `Tag ${tag} must be ${expected}`;
      this.resetSequences();
      this.sendReject(seq ?? 1, "A", value === undefined ? 1 : 5, tag, text);
      this.logoutAndDisconnect(text);
      return;
    }
    const peerInterval = Number(getField(msg, 108));
    if (Number.isInteger(peerInterval) && peerInterval > 0) this.heartBtIntSec = peerInterval;

    this.resetSequences(); // 141=Y
    this._nextInSeq = (seq ?? 1) + 1;
    this.sendAdmin("A", this.logonFields()); // echoes the initiator's HeartBtInt
    this.setState("ACTIVE", "logged on");
    this.scheduleOutboundHeartbeat();
  }

  private applySequenceReset(msg: FixMessage, seq: number): void {
    const newSeq = Number(getField(msg, 36));
    if (!Number.isInteger(newSeq) || newSeq < this._nextInSeq) {
      this.sendReject(seq, "4", 5, 36, "NewSeqNo may not lower the expected MsgSeqNum");
      return;
    }
    this._nextInSeq = newSeq;
  }

  /** FIX: replay app messages as PossDup; replace runs of admin messages with one GapFill. */
  private answerResendRequest(msg: FixMessage): void {
    const begin = Number(getField(msg, 7));
    const endField = Number(getField(msg, 16));
    const lastSent = this._nextOutSeq - 1;
    const end = endField === 0 || endField > lastSent ? lastSent : endField;
    if (!Number.isInteger(begin) || begin < 1 || begin > end) return;

    this.replaying = true;
    let gap: { seq: number; origSendingTime: string } | null = null;
    const flushGap = (next: number) => {
      if (gap === null) return;
      // FIX: GapFill carries the skipped message's MsgSeqNum and original SendingTime.
      this.sendMessage("4", [[123, "Y"], [36, String(next)]], { resendOf: gap });
      gap = null;
    };

    for (let seq = begin; seq <= end; seq++) {
      const stored = this.store.get(seq);
      if (!stored || stored.admin) {
        gap ??= {
          seq,
          origSendingTime: stored?.sendingTime ?? formatUtcTimestamp(this.clock.now()),
        };
        continue;
      }
      flushGap(seq);
      this.sendMessage(stored.msgType, stored.fields, {
        resendOf: { seq, origSendingTime: stored.sendingTime },
      });
    }
    flushGap(end + 1);
    this.replaying = false;

    for (const [type, fields] of this.outboundQueue.splice(0)) this.sendMessage(type, fields);
  }

  private sendReject(refSeq: number, refMsgType: string, reason: number, refTag: number, text: string): void {
    this.sendAdmin("3", [
      [45, String(refSeq)],
      [371, String(refTag)],
      [372, refMsgType],
      [373, String(reason)],
      [58, text],
    ]);
  }

  // ------------------------------------------------------------------ timers

  private get intervalMs(): number {
    return this.heartBtIntSec * 1000;
  }

  private sessionIsLive(): boolean {
    return this._state === "ACTIVE" || this._state === "RESENDING";
  }

  private scheduleOutboundHeartbeat(): void {
    this.clock.clearTimeout(this.outboundTimer);
    if (!this.sessionIsLive() && this._state !== "LOGON_SENT") return;
    this.outboundTimer = this.clock.setTimeout(() => this.onOutboundIdle(), this.intervalMs);
  }

  private onOutboundIdle(): void {
    if (!this.sessionIsLive()) return;
    if (this.clock.now() < this.heartbeatsPausedUntil) {
      // Fault: suppress regular heartbeats (TestRequests are still answered).
      this.outboundTimer = this.clock.setTimeout(() => this.onOutboundIdle(), this.intervalMs);
      return;
    }
    this.sendAdmin("0", []); // FIX: Heartbeat after HeartBtInt of outbound silence
  }

  private onAnyInbound(): void {
    this.clock.clearTimeout(this.testRequestTimer);
    this.testRequestTimer = null;
    this.clock.clearTimeout(this.inboundTimer);
    this.inboundTimer = this.clock.setTimeout(
      () => this.onInboundIdle(),
      this.intervalMs * INBOUND_IDLE_FACTOR,
    );
  }

  private onInboundIdle(): void {
    if (!this.sessionIsLive()) return;
    // FIX: silence beyond HeartBtInt (+20% tolerance) → TestRequest; no answer within HeartBtInt → disconnect.
    this.testRequestCounter += 1;
    this.sendAdmin("1", [[112, `TEST-${this.testRequestCounter}`]]);
    this.testRequestTimer = this.clock.setTimeout(
      () => this.disconnect("heartbeat timeout"),
      this.intervalMs,
    );
  }

  // ------------------------------------------------------------------- state

  private resetSequences(): void {
    this._nextOutSeq = 1;
    this._nextInSeq = 1;
    this.highestSeenSeq = 0;
    this.store.clear();
  }

  private logoutAndDisconnect(reason: string): void {
    this.sendAdmin("5", [[58, reason]]);
    this.disconnect(reason);
  }

  private disconnect(reason: string, closeTransport = true): void {
    if (this._state === "DISCONNECTED") return;
    for (const timer of [
      this.outboundTimer,
      this.inboundTimer,
      this.testRequestTimer,
      this.logonTimer,
      this.logoutTimer,
    ]) {
      this.clock.clearTimeout(timer);
    }
    this.setState("DISCONNECTED", reason);
    if (closeTransport) this.transport?.close();
    this.transport = null;
  }

  private setState(state: SessionState, reason: string | null = null): void {
    if (this._state === state) return;
    this._state = state;
    this.emit("state", state, reason);
  }
}
