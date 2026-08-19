import { useState } from "react";
import WorkspaceCanvas from "./WorkspaceCanvas";
import LayerPanel from "./panels/LayerPanel";
import SummaryPanel from "./panels/SummaryPanel";
import ContentPanel from "./panels/ContentPanel";
import DisplayPanel from "./panels/DisplayPanel";
import PrintView from "./PrintView";
import { useStore, wallBounds } from "../state/store";

export default function EditorScreen() {
  const calibration = useStore((s) => s.calibration);
  const recalibrate = useStore((s) => s.recalibrate);
  const layers = useStore((s) => s.layers);
  const [printing, setPrinting] = useState(false);

  if (!calibration) return null;
  const bounds = wallBounds(calibration);

  return (
    <div className="editor-layout">
      <section className="canvas-pane">
        <header className="canvas-head">
          <div>
            <h2>작업 캔버스</h2>
            <p className="muted small">
              벽면 {bounds.widthCm.toFixed(0)} × {bounds.heightCm.toFixed(0)} cm · 기준{" "}
              {calibration.referenceWidthCm} × {calibration.referenceHeightCm} cm
            </p>
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost btn-sm" onClick={recalibrate}>
              스케일 다시 잡기
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={layers.length === 0}
              onClick={() => setPrinting(true)}
            >
              인쇄 · PDF
            </button>
          </div>
        </header>

        <WorkspaceCanvas />

        <p className="muted small canvas-hint">
          레이어를 드래그해 옮기고, 우하단 손잡이를 끌면 캐비닛 단위로 스냅되어 커집니다. 벽면을 벗어나거나
          다른 레이어와 겹치는 배치는 자동으로 막힙니다.
        </p>
      </section>

      <aside className="side-pane">
        <LayerPanel />
        <ContentPanel />
        <DisplayPanel />
        <SummaryPanel />
      </aside>

      {printing && <PrintView onClose={() => setPrinting(false)} />}
    </div>
  );
}
