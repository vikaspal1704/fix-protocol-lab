export interface ServerConfig {
  readonly port: number;
  readonly heartbeatIntervalSec: number;
  readonly maxSandboxes: number;
  readonly sandboxIdleTimeoutSec: number;
  readonly orderRateLimitPerSec: number;
  readonly fillSeed: number | null;
  readonly publicOrigin: string | null;
  readonly webDist: string | null;
}

export interface Instrument {
  readonly symbol: string;
  readonly refPx: string;
}

export const INSTRUMENTS: readonly Instrument[] = [
  { symbol: "DEMO", refPx: "101.00" },
  { symbol: "ACME", refPx: "50.00" },
];

const int = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`expected a non-negative integer, got "${value}"`);
  return n;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: int(env.PORT, 8080),
    heartbeatIntervalSec: int(env.HEARTBEAT_INTERVAL_SEC, 10),
    maxSandboxes: int(env.MAX_SANDBOXES, 50),
    sandboxIdleTimeoutSec: int(env.SANDBOX_IDLE_TIMEOUT_SEC, 600),
    orderRateLimitPerSec: int(env.ORDER_RATE_LIMIT_PER_SEC, 5),
    fillSeed: env.FILL_SEED ? int(env.FILL_SEED, 0) : null,
    publicOrigin: env.PUBLIC_ORIGIN || null,
    webDist: env.WEB_DIST || null,
  };
}
