import { useRef } from "react";
import { useStore } from "../../state/store";

export default function ContentPanel() {
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const setLayerContent = useStore((s) => s.setLayerContent);
  const setLayerFitMode = useStore((s) => s.setLayerFitMode);
  const clearLayerContent = useStore((s) => s.clearLayerContent);

  const inputRef = useRef<HTMLInputElement>(null);
  const selected = layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <section className="panel">
      <h2>콘텐츠</h2>
      {!selected ? (
        <p className="muted small">레이어를 선택하면 이미지를 올릴 수 있습니다.</p>
      ) : (
        <>
          <div className="btn-row">
            <button className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}>
              {selected.content ? "이미지 교체" : "이미지 올리기"}
            </button>
            {selected.content && (
              <button className="btn btn-ghost btn-sm danger" onClick={() => clearLayerContent(selected.id)}>
                제거
              </button>
            )}
          </div>

          {selected.content && (
            <div className="segmented" style={{ marginTop: 10 }}>
              <button
                className={selected.content.fitMode === "cover" ? "active" : ""}
                onClick={() => setLayerFitMode(selected.id, "cover")}
              >
                꽉 채우기
              </button>
              <button
                className={selected.content.fitMode === "contain" ? "active" : ""}
                onClick={() => setLayerFitMode(selected.id, "contain")}
              >
                비율 유지
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && selected) {
                // Default to filling the panel: an LED face is a fixed physical
                // canvas, so letterbox bars are almost never what is wanted.
                setLayerContent(selected.id, URL.createObjectURL(file), selected.content?.fitMode ?? "cover");
              }
              e.target.value = "";
            }}
          />
        </>
      )}
    </section>
  );
}
