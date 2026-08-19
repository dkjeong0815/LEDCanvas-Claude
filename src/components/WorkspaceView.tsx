import { wallBounds } from "../state/store";
import { layerSizeCm } from "../lib/cabinets";
import { layerColor } from "../lib/palette";
import type { Calibration, Layer } from "../types";

export interface WorkspaceViewProps {
  calibration: Calibration;
  layers: Layer[];
  /** available box, in CSS px; the wall is contain-fitted inside it */
  frameWidth: number;
  frameHeight: number;
  selectedLayerId?: string | null;
  /** interaction — omitted for the printed sheet */
  onLayerPointerDown?: (e: React.PointerEvent, layer: Layer) => void;
  onHandlePointerDown?: (e: React.PointerEvent, layer: Layer) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  showHandles?: boolean;
  /**
   * Draw each layer's captured still instead of the playing video. The printed
   * sheet sets this: paper holds one frame, and a live <video> prints blank in
   * some browsers.
   */
  stillContent?: boolean;
}

/**
 * The arrangement itself: rectified wall, layers where the user put them, each
 * layer's content inside it — the video plays in the editor, and the still
 * captured from it stands in on paper.
 *
 * The editor and the printed sheet both render through here, on purpose. When
 * printing re-drew the same scene with its own canvas code, the two drifted —
 * different border colours, missing captions, different clipping — and the
 * printout stopped being the thing the user had arranged. One component means
 * what you place is literally what you print.
 */
export default function WorkspaceView({
  calibration,
  layers,
  frameWidth,
  frameHeight,
  selectedLayerId,
  onLayerPointerDown,
  onHandlePointerDown,
  onPointerMove,
  onPointerUp,
  showHandles = false,
  stillContent = false,
}: WorkspaceViewProps) {
  const scale =
    frameWidth > 0 && frameHeight > 0
      ? Math.min(frameWidth / calibration.rectWidthPx, frameHeight / calibration.rectHeightPx)
      : 0;

  if (scale <= 0) return null;

  const imgWidth = calibration.rectWidthPx * scale;
  const imgHeight = calibration.rectHeightPx * scale;
  const offsetX = (frameWidth - imgWidth) / 2;
  const offsetY = (frameHeight - imgHeight) / 2;
  const pxPerCm = calibration.pxPerCm * scale;
  const bounds = wallBounds(calibration);

  const boxFor = (xCm: number, yCm: number, widthCm: number, heightCm: number) => ({
    left: offsetX + (xCm - calibration.originCm.x) * pxPerCm,
    top: offsetY + (yCm - calibration.originCm.y) * pxPerCm,
    width: widthCm * pxPerCm,
    height: heightCm * pxPerCm,
  });

  return (
    <>
      <img
        className="workspace-photo"
        src={calibration.rectifiedUrl}
        alt="정면 보정된 벽면"
        style={{ left: offsetX, top: offsetY, width: imgWidth, height: imgHeight }}
        draggable={false}
      />
      <div
        className="wall-outline"
        style={boxFor(bounds.xCm, bounds.yCm, bounds.widthCm, bounds.heightCm)}
        aria-hidden="true"
      />

      {layers.map((layer, index) => {
        const { widthCm, heightCm } = layerSizeCm(layer);
        const color = layerColor(index);
        const selected = layer.id === selectedLayerId;
        return (
          <div
            key={layer.id}
            className={`layer ${selected ? "selected" : ""}`}
            style={{ ...boxFor(layer.xCm, layer.yCm, widthCm, heightCm), borderColor: color }}
            onPointerDown={onLayerPointerDown ? (e) => onLayerPointerDown(e, layer) : undefined}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {layer.content &&
              (stillContent ? (
                <img
                  className="layer-content"
                  src={layer.content.posterUrl}
                  alt=""
                  style={{ objectFit: layer.content.fitMode }}
                  draggable={false}
                />
              ) : (
                <video
                  className="layer-content"
                  src={layer.content.url}
                  poster={layer.content.posterUrl}
                  style={{ objectFit: layer.content.fitMode }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ))}
            <span className="layer-badge" style={{ background: color }}>
              {layer.label}
            </span>
            <span className="layer-dims">
              {widthCm.toFixed(0)} × {heightCm.toFixed(0)} cm
            </span>
            {showHandles && (
              <div
                className="layer-handle"
                style={{ background: color }}
                onPointerDown={onHandlePointerDown ? (e) => onHandlePointerDown(e, layer) : undefined}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
