import { useId, type ReactNode } from "react";

export function Panel(props: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`flex min-w-0 flex-col rounded-lg border border-border bg-panel ${props.className ?? ""}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 id={headingId} className="text-[13px] font-semibold">
          {props.title}
        </h2>
        {props.actions}
      </header>
      {props.children}
    </section>
  );
}

export function Chip(props: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "bad" | "accent"; title?: string }) {
  const tone = {
    muted: "text-muted border-border",
    ok: "text-ok border-ok/40",
    warn: "text-warn border-warn/40",
    bad: "text-bad border-bad/40",
    accent: "text-accent border-accent/40",
  }[props.tone ?? "muted"];
  return (
    <span title={props.title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-medium ${tone}`}>
      {props.children}
    </span>
  );
}
