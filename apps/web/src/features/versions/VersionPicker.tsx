import { useAppDispatch, useAppSelector } from "../../app/store";
import { connect } from "../connection/actions";

export function VersionPicker() {
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.connection.fixVersion);
  const versions = useAppSelector((s) => s.connection.hello?.fixVersions ?? []);

  return (
    <div role="radiogroup" aria-label="FIX version" className="flex flex-wrap items-center gap-1">
      {versions.map((v) => {
        const planned = v.status === "planned";
        const selected = v.id === current;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={planned}
            title={planned ? `${v.label} is planned: ${v.summary}` : v.summary}
            onClick={() => {
              if (selected) return;
              const url = new URL(window.location.href);
              url.searchParams.set("fixVersion", v.id);
              window.history.replaceState(null, "", url);
              dispatch(connect({ fixVersion: v.id }));
            }}
            className={`rounded-md border px-2 py-1 text-[12px] ${
              selected
                ? "border-accent bg-accent text-accent-text"
                : planned
                  ? "cursor-not-allowed border-dashed border-border text-muted"
                  : "border-border hover:bg-panel-2"
            }`}
          >
            {v.label}
            {planned && <span className="ml-1 text-[10px] uppercase tracking-wide">planned</span>}
          </button>
        );
      })}
    </div>
  );
}
