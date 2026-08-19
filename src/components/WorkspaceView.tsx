import { wallBounds } from "../state/store";
import { layerSizeCm } from "../lib/cabinets";
import { layerColor } from "../lib/palette";
import type { Calibration, DisplayOptions, Layer } from "../types";

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
  /** annotations, shadow and glow — shared with the sheet and the PNG */
  display: DisplayOptions;
}

/**
 * Shadow and glow scale with the rendered width, never a fixed pixel figure.
 * The same arrangement is drawn at editor zoom, at sheet size and at the
 * photo's native resolution for the PNG; a constant blur would look right in
 * exactly one of the three.
 */
function panelShadow(
  widthPx: number,
  display: DisplayOptions,
  selected: boolean,
  glowColor?: string
) {
  const parts: string[] = [];
  // The selection ring rides with the border toggle. With borders off the face
  // is meant to look like a panel on a wall, and a white ring around it gives
  // the game away just as much as the outline does — so editing aids come back
  // together, by turning borders on.
  if (selected && display.showBorders) parts.push("0 0 0 2px rgba(255, 255, 255, 0.5)");
  if (display.shadow) {
    parts.push(`0 ${widthPx * 0.012}px ${widthPx * 0.045}px rgba(0, 0, 0, 0.42)`);
  }
  if (display.glow > 0 && glowColor) {
    parts.push(`0 0 ${widthPx * 0.09}px ${widthPx * 0.02}px rgba(${glowColor}, ${display.glow})`);
  }
  // "none" rather than undefined: the stylesheet still carries a selection
  // ring for .layer.selected, and letting it through would defeat the toggle.
  return parts.length ? parts.join(", ") : "none";
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
  display,
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
      {display.showBorders && (
        <div
          className="wall-outline"
          style={boxFor(bounds.xCm, bounds.yCm, bounds.widthCm, bounds.heightCm)}
          aria-hidden="true"
        />
      )}

      {layers.map((layer, index) => {
        const { widthCm, heightCm } = layerSizeCm(layer);
        const color = layerColor(index);
        const selected = layer.id === selectedLayerId;
        const box = boxFor(layer.xCm, layer.yCm, widthCm, heightCm);
        return (
          <div
            key={layer.id}
            className={`layer ${selected ? "selected" : ""}`}
            style={{
              ...box,
              // The 2px border stays in the box model even when hidden, so the
              // face keeps its exact size; only its colour goes away.
              borderColor: display.showBorders ? color : "transparent",
              boxShadow: panelShadow(box.width, display, selected, layer.content?.glowColor),
            }}
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
            {display.showLabels && (
              <span className="layer-badge" style={{ background: color }}>
                {layer.label}
              </span>
            )}
            {display.showDims && (
              <span className="layer-dims">
                {widthCm.toFixed(0)} × {heightCm.toFixed(0)} cm
              </span>
            )}
            {showHandles && display.showBorders && (
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
