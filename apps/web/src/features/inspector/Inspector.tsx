import { useAppDispatch, useAppSelector } from "../../app/store";
import { Chip, Panel } from "../../components/Panel";
import { tagInfo, valueMeaning } from "../dictionary/dictionary";
import { selectTag } from "../dictionary/uiSlice";

export function Inspector() {
  const dispatch = useAppDispatch();
  const row = useAppSelector((s) => s.messages.rows.find((r) => r.id === s.messages.selectedId) ?? null);
  const selectedTag = useAppSelector((s) => s.ui.selectedTag);

  return (
    <Panel title="Message inspector">
      {!row ? (
        <p className="p-3 text-[12px] text-muted">Select any message in the flow to see its raw bytes and every field explained.</p>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-semibold">{row.msgTypeName}</span>
            <Chip tone={row.category === "app" ? "accent" : "muted"}>{row.category === "app" ? "application" : "session / admin"}</Chip>
            <Chip>{row.fixVersion}</Chip>
            <span className="text-muted">
              {row.from} → {row.to} · {row.delivery}
            </span>
          </div>
          {row.note && <p className="text-[12px] text-bad">{row.note}</p>}
          <p data-testid="raw" className="break-all rounded bg-panel-2 p-2 font-mono text-[12px] leading-5">
            {row.fields.map(([tag, value], i) => (
              <span key={i}>
                <button
                  type="button"
                  onClick={() => dispatch(selectTag(tag))}
                  className={`rounded px-0.5 hover:underline ${selectedTag === tag ? "bg-[var(--row-selected)] outline outline-1 outline-accent" : ""}`}
                >
                  {tag}={value}
                </button>
                <span className="text-muted">|</span>
              </span>
            ))}
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-panel text-left text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Tag</th>
                  <th className="py-1 pr-2 font-medium">Name</th>
                  <th className="py-1 pr-2 font-medium">Value</th>
                  <th className="py-1 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {row.fields.map(([tag, value], i) => (
                  <tr key={i} className="cursor-pointer border-t border-border hover:bg-panel-2" onClick={() => dispatch(selectTag(tag))}>
                    <td className="py-0.5 pr-2 font-mono">{tag}</td>
                    <td className="py-0.5 pr-2">{tagInfo(row.fixVersion, tag)?.name ?? "—"}</td>
                    <td className="break-all py-0.5 pr-2 font-mono">{value}</td>
                    <td className="py-0.5 text-muted">{valueMeaning(row.fixVersion, tag, value) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
