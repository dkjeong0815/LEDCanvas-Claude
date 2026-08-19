import { useRef, useState } from "react";
import { useStore } from "../../state/store";
import { captureFirstFrame } from "../../lib/videoPoster";

export default function ContentPanel() {
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const setLayerContent = useStore((s) => s.setLayerContent);
  const setLayerFitMode = useStore((s) => s.setLayerFitMode);
  const clearLayerContent = useStore((s) => s.clearLayerContent);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = layers.find((l) => l.id === selectedLayerId) ?? null;

  async function accept(file: File, layerId: string, fitMode: "cover" | "contain") {
    setBusy(true);
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      // The still has to exist before the layer does: a layer whose content
      // cannot be printed is worse than a layer with no content at all.
      const poster = await captureFirstFrame(url);
      setLayerContent(layerId, url, poster.url, poster.glowColor, fitMode);
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(e instanceof Error ? e.message : "동영상을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>콘텐츠</h2>
      {!selected ? (
        <p className="muted small">레이어를 선택하면 동영상을 올릴 수 있습니다.</p>
      ) : (
        <>
          <div className="btn-row">
            <button
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "읽는 중…" : selected.content ? "동영상 교체" : "동영상 올리기"}
            </button>
            {selected.content && !busy && (
              <button
                className="btn btn-ghost btn-sm danger"
                onClick={() => {
                  setError(null);
                  clearLayerContent(selected.id);
                }}
              >
                제거
              </button>
            )}
          </div>

          {error && (
            <p className="muted small" style={{ marginTop: 8 }} role="alert">
              {error}
            </p>
          )}

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

          {selected.content && (
            <p className="muted small" style={{ marginTop: 8 }}>
              인쇄와 PNG에는 첫 프레임이 들어갑니다.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && selected) {
                // Default to filling the panel: an LED face is a fixed physical
                // canvas, so letterbox bars are almost never what is wanted.
                void accept(file, selected.id, selected.content?.fitMode ?? "cover");
              }
              e.target.value = "";
            }}
          />
        </>
      )}
    </section>
  );
}
