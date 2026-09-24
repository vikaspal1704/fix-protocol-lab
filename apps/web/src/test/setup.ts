import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// REST calls answer from fixtures; no network in unit tests.
vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = url.endsWith("/api/instruments")
    ? [{ symbol: "DEMO", refPx: "101.00" }, { symbol: "ACME", refPx: "50.00" }]
    : { status: "ok", version: "0.1.0", uptimeSec: 1, sandboxes: 1 };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
});
