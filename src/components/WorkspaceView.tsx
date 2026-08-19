import { Fragment } from "react";
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
 *
 * Nothing is drawn above the face. A panel hung on a wall is lit from above,
 * so light and shade both fall away from the top edge — anything spilling
 * upwards reads as a sticker. The top is cut off by clip-path rather than by
 * offsetting the shadow downwards, because an offset that clears the top also
 * drags the side shading down with it.
 */
function panelShadow(widthPx: number, display: DisplayOptions, glowColor?: string) {
  const parts: string[] = [];

  if (display.shadow) {
    // Three stages from the edge outwards. The first hugs the edge and is
    // nearly opaque black — that contact line is what makes a panel look like
    // it is standing off the wall rather than printed on it. Only the blur
    // takes the slider: the offsets place the shadow and the spread sets how
    // far the black reaches, and softening should not move either.
    const b = widthPx * display.shadowBlur;
    parts.push(`0 0 ${b * 0.012}px ${widthPx * 0.004}px rgba(0, 0, 0, 0.95)`);
    parts.push(`0 ${widthPx * 0.010}px ${b * 0.030}px rgba(0, 0, 0, 0.75)`);
    parts.push(`0 ${widthPx * 0.025}px ${b * 0.070}px rgba(0, 0, 0, 0.45)`);
  }

  if (display.glow > 0 && glowColor) {
    // Behind the shading, so the edge stays dark and the light shows further
    // out. Two stages, because that is how a lit screen throws light: a tight
    // bright rim and a wide soft wash. One blur alone reads as a coloured
    // border rather than as light.
    parts.push(`0 0 ${widthPx * 0.10}px ${widthPx * 0.025}px rgba(${glowColor}, ${display.glow})`);
    parts.push(
      `0 0 ${widthPx * 0.34}px ${widthPx * 0.07}px rgba(${glowColor}, ${display.glow * 0.55})`
    );
  }

  return parts.length ? parts.join(", ") : undefined;
}

/**
 * The face's own surface, laid over the picture rather than behind it: a thin
 * bright line where the bezel catches the light, and a short dark fall from
 * the inner top edge. Both are what separate "a thing hanging on the wall"
 * from "a picture pasted into the wall".
 *
 * It rides on its own element because an inset shadow on the layer would be
 * painted underneath the video, not over it.
 */
function faceSurface(widthPx: number) {
  const bezel = Math.max(1, widthPx * 0.0016);
  const fall = widthPx * 0.03;
  return {
    // The bezel is lit metal; the shading is the recessed glass behind it. So
    // the shading starts inside the bezel — padding plus content-box clipping
    // keeps it off the bright line, which would otherwise go grey at the top.
    padding: bezel,
    backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0) ${fall}px)`,
    backgroundClip: "content-box" as const,
    boxShadow: `inset 0 0 0 ${bezel}px rgba(255, 255, 255, 0.35)`,
  };
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
        const shade = panelShadow(box.width, display, layer.content?.glowColor);
        return (
          <Fragment key={layer.id}>
            {/* Its own element, painted under the face: clip-path removes
                everything above the top edge, and clipping the face itself
                would take the picture with it. */}
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
              outline: display.showBorders ? `2px solid ${color}` : undefined,
              outlineOffset: -2,
              // The stylesheet keeps a selection ring for .layer.selected; it
              // rides with the border toggle, so state it here either way.
              boxShadow: selected && display.showBorders ? "0 0 0 2px rgba(255, 255, 255, 0.5)" : "none",
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
            {display.surface && (
              <div
                className="layer-face"
                style={faceSurface(box.width)}
                aria-hidden="true"
              />
            )}
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
          </Fragment>
        );
      })}
    </>
  );
}
