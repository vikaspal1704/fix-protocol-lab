import { useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "./app/store";
import { connect } from "./features/connection/actions";
import { dismissError } from "./features/connection/connectionSlice";
import { hideIntro } from "./features/dictionary/uiSlice";
import { TagPanel } from "./features/dictionary/TagPanel";
import { SequenceDiagram } from "./features/flow/SequenceDiagram";
import { Inspector } from "./features/inspector/Inspector";
import { Blotter } from "./features/orders/Blotter";
import { OrderTicket } from "./features/orders/OrderTicket";
import { Scenarios } from "./features/session/Scenarios";
import { SessionPanel } from "./features/session/SessionPanel";
import { VersionPicker } from "./features/versions/VersionPicker";

function ConnectionStatus() {
  const { status, retryInMs, hello } = useAppSelector((s) => s.connection);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (status !== "connecting") return;
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const text =
    status === "open" && hello
      ? "Live"
      : status === "reconnecting"
        ? `Reconnecting in ${Math.round((retryInMs ?? 0) / 1000)} s`
        : status === "closed"
          ? "Disconnected"
          : slow
            ? "Waking the server… (free hosting sleeps when idle)"
            : "Connecting…";
  const tone = status === "open" ? "bg-ok" : status === "closed" ? "bg-bad" : "bg-warn";
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-0.5 text-[12px]">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden /> {text}
    </span>
  );
}

function Intro() {
  const dispatch = useAppDispatch();
  const show = useAppSelector((s) => s.ui.showIntro);
  if (!show) return null;
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-panel p-3 text-[13px]">
      <div className="flex-1">
        <p className="font-semibold">What you're watching</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
          <li>Two simulated firms, <b className="text-text">BUYSIDE</b> and an exchange <b className="text-text">EXCH</b>, connected by a real TCP FIX session made just for you.</li>
          <li>Every arrow is one FIX message. <span className="text-app">Blue</span> ones carry business (orders, executions); grey ones keep the session alive (logon, heartbeats, recovery).</li>
          <li>Send an order, or break something with <i>Try it</i>, and watch the session layer detect and repair it. Click any message, then any tag, to learn what it means.</li>
        </ul>
      </div>
      <button type="button" aria-label="Dismiss introduction" onClick={() => dispatch(hideIntro())} className="self-start text-muted hover:text-text">
        ✕
      </button>
    </div>
  );
}

function ErrorToast() {
  const dispatch = useAppDispatch();
  const error = useAppSelector((s) => s.connection.lastError);
  if (!error) return null;
  return (
    <div role="alert" className="fixed bottom-4 right-4 z-10 flex max-w-sm gap-3 rounded-lg border border-bad/50 bg-panel p-3 text-[13px] shadow-lg">
      <div>
        <p className="font-semibold text-bad">{error.code}</p>
        <p>{error.message}</p>
      </div>
      <button type="button" aria-label="Dismiss error" onClick={() => dispatch(dismissError())} className="self-start text-muted">
        ✕
      </button>
    </div>
  );
}

export function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fixVersion = new URLSearchParams(window.location.search).get("fixVersion") ?? "FIX.4.4";
    dispatch(connect({ fixVersion }));
  }, [dispatch]);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <h1 className="text-[20px] font-bold leading-tight">FIX Protocol Lab</h1>
          <p className="text-[13px] text-muted">See FIX working, live: a real session between two firms, one message at a time.</p>
        </div>
        <ConnectionStatus />
        <div className="ml-auto">
          <VersionPicker />
        </div>
      </header>
      <Intro />
      <SessionPanel />
      <Scenarios />
      <main className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3">
          <OrderTicket />
          <Blotter />
        </div>
        <SequenceDiagram />
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <Inspector />
          <TagPanel />
        </div>
      </main>
      <footer className="pb-4 text-[12px] text-muted">
        FIX 4.4 today; more versions are on the way. Built from scratch in TypeScript, with no FIX libraries.{" "}
        <a className="underline" href="https://github.com/vikaspal1704/fix-protocol-lab">Source and docs</a>
      </footer>
      <ErrorToast />
    </div>
  );
}
