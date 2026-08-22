import { Fragment } from "react";
import { wallBounds } from "../state/store";
import { layerSizeCm } from "../lib/cabinets";
import { layerColor } from "../lib/palette";
import { screenFilter } from "../lib/faceFilter";
import type { Calibration, DisplayOptions, Layer } from "../types";
import { cm } from "../lib/format";

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
   * Draw every layer's still instead of playing its video. The printed sheet
   * sets this: paper holds one frame, and a live <video> prints blank in some
   * browsers.
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
 *
 * All four edges are shaded. The contact stage carries no offset, so the black
 * line at the edge is the same weight the whole way round; the softer stages
 * are offset downwards, which leaves the top lighter than the bottom without
 * ever leaving it bare.
 */
function panelShadow(widthPx: number, display: DisplayOptions) {
  if (!display.shadow) return undefined;

  const b = widthPx * display.shadowAmount;
  const a = (base: number) => Math.min(1, base * display.shadowAmount).toFixed(3);
  // No spread on the contact stage. Spread widens the darkest pixels into a
  // band of even thickness all the way round, which is exactly what a frame
  // looks like; blur alone falls off from the edge, which is what shade does.
  return [
    `0 0 ${b * 0.010}px rgba(0, 0, 0, ${a(0.5)})`,
    `0 ${widthPx * 0.008}px ${b * 0.028}px rgba(0, 0, 0, ${a(0.3)})`,
    `0 ${widthPx * 0.022}px ${b * 0.065}px rgba(0, 0, 0, ${a(0.2)})`,
  ].join(", ");
}

/**
 * The light the face throws onto the wall. Two stages, because that is how a
 * lit screen spills: a tight bright rim and a wide soft wash — one blur alone
 * reads as a coloured border rather than as light.
 *
 * It is screen-blended, not painted over. Light adds; a translucent colour laid
 * on top does not. Teal spill over a pale wall was coming out darker than the
 * bare wall, which is the opposite of what a lit panel does.
 */
function panelGlow(widthPx: number, display: DisplayOptions, glowColor?: string) {
  if (!(display.glow > 0) || !glowColor) return undefined;

  return [
    `0 0 ${widthPx * 0.10}px ${widthPx * 0.025}px rgba(${glowColor}, ${display.glow})`,
    `0 0 ${widthPx * 0.34}px ${widthPx * 0.07}px rgba(${glowColor}, ${display.glow * 0.55})`,
  ].join(", ");
}

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
      {display.annotations && (
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
        const shade = panelShadow(box.width, display);
        const glow = panelGlow(box.width, display, layer.content?.glowColor);
        const lit = screenFilter(display);
        return (
          <Fragment key={layer.id}>
            {/* Both ride on their own elements under the face — the face
                itself cannot carry them without the picture covering them,
                and the light has to blend differently from the shade. */}
            {glow && (
              <div className="layer-glow" style={{ ...box, boxShadow: glow }} aria-hidden="true" />
            )}
            {shade && (
              <div className="layer-shade" style={{ ...box, boxShadow: shade }} aria-hidden="true" />
            )}
          <div
            className={`layer ${selected ? "selected" : ""}`}
            style={{
              ...box,
              // Drawn as an outline, pulled inside the box: it takes no space,
              // so the content fills the face's real size whether the outline
              // is on or off.
              outline: display.annotations ? `2px solid ${color}` : undefined,
              outlineOffset: -2,
              // The stylesheet keeps a selection ring for .layer.selected; it
              // rides with the border toggle, so state it here either way.
              boxShadow: selected && display.annotations ? "0 0 0 2px rgba(255, 255, 255, 0.5)" : "none",
            }}
            onPointerDown={onLayerPointerDown ? (e) => onLayerPointerDown(e, layer) : undefined}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {layer.content &&
              // Paper always takes the still, and an image is its own still —
              // so the video element is the exception, not the default.
              (stillContent || layer.content.kind === "image" ? (
                <img
                  className="layer-content"
                  src={layer.content.posterUrl}
                  alt=""
                  style={{ objectFit: layer.content.fitMode, filter: lit }}
                  draggable={false}
                />
              ) : (
                <video
                  className="layer-content"
                  // The pixel preview reads frames off this element rather
                  // than decoding the same file a second time.
                  data-layer-id={layer.id}
                  src={layer.content.url}
                  poster={layer.content.posterUrl}
                  style={{ objectFit: layer.content.fitMode, filter: lit }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ))}
            {display.annotations && (
              <span className="layer-badge" style={{ background: color }}>
                {layer.label}
              </span>
            )}
            {display.annotations && (
              <span className="layer-dims">
                {cm(widthCm)} × {cm(heightCm)} cm
              </span>
            )}
            {showHandles && display.annotations && (
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
          </Fragment>
        );
      })}
    </>
  );
}
