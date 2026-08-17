import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { CABINETS } from "../lib/cabinets";
import WorkspaceView from "./WorkspaceView";
import type { Layer } from "../types";

interface DragState {
  id: string;
  kind: "move" | "resize";
  startXCm: number;
  startYCm: number;
  startCols: number;
  startRows: number;
  startClientX: number;
  startClientY: number;
}

export default function WorkspaceCanvas() {
  const calibration = useStore((s) => s.calibration);
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const moveLayer = useStore((s) => s.moveLayer);
  const setLayerGrid = useStore((s) => s.setLayerGrid);

  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [calibration]);

  if (!calibration) return null;

  const scale =
    frame.width > 0 && frame.height > 0
      ? Math.min(frame.width / calibration.rectWidthPx, frame.height / calibration.rectHeightPx)
      : 0;
  const pxPerCmScreen = calibration.pxPerCm * scale;

  const beginDrag = (e: React.PointerEvent, layer: Layer, kind: DragState["kind"]) => {
    e.stopPropagation();
    selectLayer(layer.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: layer.id,
      kind,
      startXCm: layer.xCm,
      startYCm: layer.yCm,
      startCols: layer.cols,
      startRows: layer.rows,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  };

  const onDragMove = (e: React.PointerEvent) => {
    const ds = drag.current;
    if (!ds || pxPerCmScreen <= 0) return;
    const dxCm = (e.clientX - ds.startClientX) / pxPerCmScreen;
    const dyCm = (e.clientY - ds.startClientY) / pxPerCmScreen;

    if (ds.kind === "move") {
      moveLayer(ds.id, ds.startXCm + dxCm, ds.startYCm + dyCm);
      return;
    }

    const layer = layers.find((l) => l.id === ds.id);
    if (!layer) return;
    const spec = CABINETS[layer.cabinetType];
    const targetW = spec.widthCm * ds.startCols + dxCm;
    const targetH = spec.heightCm * ds.startRows + dyCm;
    const cols = Math.max(1, Math.round(targetW / spec.widthCm));
    const rows = Math.max(1, Math.round(targetH / spec.heightCm));
    if (cols !== layer.cols || rows !== layer.rows) setLayerGrid(ds.id, cols, rows);
  };

  const endDrag = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  return (
    <div className="workspace-frame" ref={frameRef} onPointerDown={() => selectLayer(null)}>
      <WorkspaceView
        calibration={calibration}
        layers={layers}
        frameWidth={frame.width}
        frameHeight={frame.height}
        selectedLayerId={selectedLayerId}
        onLayerPointerDown={(e, layer) => beginDrag(e, layer, "move")}
        onHandlePointerDown={(e, layer) => beginDrag(e, layer, "resize")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        showHandles
      />
    </div>
  );
}
