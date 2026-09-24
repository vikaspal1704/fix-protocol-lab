import { useAppSelector } from "../../app/store";
import { Chip, Panel } from "../../components/Panel";
import { tagInfo } from "./dictionary";

export function TagPanel() {
  const tag = useAppSelector((s) => s.ui.selectedTag);
  const fixVersion = useAppSelector((s) => s.connection.fixVersion);
  const info = tag === null ? undefined : tagInfo(fixVersion, tag);

  return (
    <Panel title="Tag reference">
      <div className="p-3 text-[13px]" aria-live="polite">
        {tag === null ? (
          <p className="text-[12px] text-muted">Click any tag, in the inspector or the encoded preview, to see what it means in {fixVersion}.</p>
        ) : !info ? (
          <p className="text-[12px] text-muted">Tag {tag} isn't in the {fixVersion} dictionary used here.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[18px] font-semibold">{info.tag}</span>
              <span className="text-[15px] font-semibold">{info.name}</span>
              <Chip>{info.type}</Chip>
            </div>
            <p>{info.description}</p>
            {info.values && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                {Object.entries(info.values).map(([code, meaning]) => (
                  <div key={code} className="contents">
                    <dt className="font-mono text-muted">{code}</dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
