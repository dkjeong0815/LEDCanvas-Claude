import { useStore } from "../../state/store";
import { CABINETS, CABINET_TYPES, PIXEL_PITCH_PRESETS, cabinetCount, layerResolutionPx, layerSizeCm } from "../../lib/cabinets";

export default function LayerPanel() {
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const addLayer = useStore((s) => s.addLayer);
  const removeLayer = useStore((s) => s.removeLayer);
  const nudgeCols = useStore((s) => s.nudgeCols);
  const nudgeRows = useStore((s) => s.nudgeRows);
  const setLayerCabinetType = useStore((s) => s.setLayerCabinetType);
  const setLayerPitch = useStore((s) => s.setLayerPitch);

  const selected = layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>레이어</h2>
        <button className="btn btn-primary btn-sm" onClick={addLayer}>
          추가
        </button>
      </div>

      {layers.length === 0 ? (
        <p className="muted small">아직 레이어가 없습니다. 추가를 눌러 첫 LED 면을 배치하세요.</p>
      ) : (
        <div className="chip-row">
          {layers.map((l) => (
            <button
              key={l.id}
              className={`chip ${l.id === selectedLayerId ? "active" : ""}`}
              onClick={() => selectLayer(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="layer-editor">
          <div className="panel-head">
            <h3>{selected.label}</h3>
            <button className="btn btn-ghost btn-sm danger" onClick={() => removeLayer(selected.id)}>
              삭제
            </button>
          </div>

          <label className="field-label">캐비닛</label>
          <div className="segmented">
            {CABINET_TYPES.map((t) => (
              <button
                key={t}
                className={selected.cabinetType === t ? "active" : ""}
                onClick={() => setLayerCabinetType(selected.id, t)}
              >
                {CABINETS[t].label}
              </button>
            ))}
          </div>

          <div className="stepper-row">
            <span>가로</span>
            <div className="stepper">
              <button onClick={() => nudgeCols(selected.id, -1)} disabled={selected.cols <= 1}>
                −
              </button>
              <b>{selected.cols}</b>
              <button onClick={() => nudgeCols(selected.id, 1)}>+</button>
            </div>
            <span>세로</span>
            <div className="stepper">
              <button onClick={() => nudgeRows(selected.id, -1)} disabled={selected.rows <= 1}>
                −
              </button>
              <b>{selected.rows}</b>
              <button onClick={() => nudgeRows(selected.id, 1)}>+</button>
            </div>
          </div>

          <label className="field-label">픽셀 피치 (mm)</label>
          <div className="chip-row">
            {PIXEL_PITCH_PRESETS.map((p) => (
              <button
                key={p}
                className={`chip ${selected.pixelPitchMm === p ? "active" : ""}`}
                onClick={() => setLayerPitch(selected.id, p)}
              >
                {p}
              </button>
            ))}
          </div>

          <dl className="stats">
            <div>
              <dt>캐비닛</dt>
              <dd>{cabinetCount(selected)}개</dd>
            </div>
            <div>
              <dt>크기</dt>
              <dd>
                {layerSizeCm(selected).widthCm.toFixed(1)} × {layerSizeCm(selected).heightCm.toFixed(1)} cm
              </dd>
            </div>
            <div>
              <dt>전체 해상도</dt>
              <dd>
                {layerResolutionPx(selected).widthPx} ×{" "}
                {layerResolutionPx(selected).heightPx} px
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
