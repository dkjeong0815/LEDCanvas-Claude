import type { Calibration, DisplayOptions, Layer, Point } from "../types";
import { layerSizeCm } from "./cabinets";
import { layerColor } from "./palette";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Draws `img` into a box the way CSS object-fit would, clipped to the box. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "contain" | "cover"
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  const matchWidth = fit === "contain" ? imgRatio > boxRatio : imgRatio < boxRatio;
  const drawW = matchWidth ? w : h * imgRatio;
  const drawH = matchWidth ? w / imgRatio : h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(x, y, w, h);
  ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
  ctx.restore();
}

export interface CompositeOptions {
  /** draw the per-cabinet grid inside each layer */
  showCabinetGrid?: boolean;
  /** annotations, shadow and glow — the same options the editor renders with */
  display: DisplayOptions;
}

/**
 * Lays the shadow and the light spill under a face, mirroring the CSS in
 * WorkspaceView — both scale with the face's drawn width so the PNG matches
 * the screen at any zoom.
 */
function drawPanelShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  display: DisplayOptions,
  glowColor?: string
) {
  const passes: { color: string; blur: number; offsetY: number }[] = [];
  if (display.glow > 0 && glowColor) {
    // Wide wash first, tight rim over it — the same two stages as the editor.
    passes.push({ color: `rgba(${glowColor}, ${display.glow * 0.55})`, blur: w * 0.34, offsetY: 0 });
    passes.push({ color: `rgba(${glowColor}, ${display.glow})`, blur: w * 0.10, offsetY: 0 });
  }
  if (display.shadow) {
    passes.push({ color: "rgba(0, 0, 0, 0.42)", blur: w * 0.045, offsetY: w * 0.012 });
  }

  for (const pass of passes) {
    ctx.save();
    ctx.shadowColor = pass.color;
    ctx.shadowBlur = pass.blur;
    ctx.shadowOffsetY = pass.offsetY;
    // The caster itself is covered by the content drawn next, so its colour
    // only matters for the fraction of a pixel at the edge.
    ctx.fillStyle = "#05070a";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

/**
 * Draws the label chip and size caption exactly the way the editor overlays
 * them, so a printed sheet reads as the same picture the user arranged.
 */
function drawLayerAnnotations(
  ctx: CanvasRenderingContext2D,
  label: string | null,
  sizeText: string | null,
  color: string,
  topLeft: Point,
  bottomRight: Point,
  fontPx: number
) {
  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  const padding = fontPx * 0.42;
  if (label !== null) {
    const chipHeight = fontPx * 1.5;
    const chipWidth = ctx.measureText(label).width + padding * 2;
    ctx.fillStyle = color;
    ctx.fillRect(topLeft.x, topLeft.y, chipWidth, chipHeight);
    ctx.fillStyle = "#0b1220";
    ctx.fillText(label, topLeft.x + padding, topLeft.y + chipHeight / 2);
  }

  if (sizeText === null) {
    ctx.restore();
    return;
  }

  ctx.font = `500 ${fontPx * 0.82}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontPx * 0.22;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(sizeText, bottomRight.x - padding, bottomRight.y - padding);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(sizeText, bottomRight.x - padding, bottomRight.y - padding);
  ctx.restore();
}

/**
 * Rasterises the arrangement — rectified wall plus every layer and its content
 * image — at the calibration's native resolution, for the PNG download.
 *
 * The printed sheet does NOT come through here: it renders `WorkspaceView`,
 * the same component the editor draws with, so the print can never drift from
 * what was arranged. This canvas path exists only because a download needs a
 * bitmap, and it deliberately mirrors that component's look.
 */
export async function renderComposite(
  calibration: Calibration,
  layers: Layer[],
  opts: CompositeOptions
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = calibration.rectWidthPx;
  canvas.height = calibration.rectHeightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  const background = await loadImage(calibration.rectifiedUrl);
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  const toPx = (cm: number) => cm * calibration.pxPerCm;

  for (const [index, layer] of layers.entries()) {
    const color = layerColor(index);
    const { widthCm, heightCm } = layerSizeCm(layer);
    const x = toPx(layer.xCm - calibration.originCm.x);
    const y = toPx(layer.yCm - calibration.originCm.y);
    const w = toPx(widthCm);
    const h = toPx(heightCm);

    drawPanelShadow(ctx, x, y, w, h, opts.display, layer.content?.glowColor);

    if (layer.content) {
      try {
        // The still, not the video: a PNG is one frame, same as the sheet.
        const img = await loadImage(layer.content.posterUrl);
        drawFitted(ctx, img, x, y, w, h, layer.content.fitMode);
      } catch {
        ctx.fillStyle = "#05070a";
        ctx.fillRect(x, y, w, h);
      }
    } else {
      ctx.fillStyle = "#05070a";
      ctx.fillRect(x, y, w, h);
    }

    if (opts.showCabinetGrid && (layer.cols > 1 || layer.rows > 1)) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = Math.max(1, calibration.pxPerCm * 0.08);
      ctx.beginPath();
      for (let c = 1; c < layer.cols; c++) {
        const gx = x + (w / layer.cols) * c;
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
      }
      for (let r = 1; r < layer.rows; r++) {
        const gy = y + (h / layer.rows) * r;
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (opts.display.showBorders) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, calibration.pxPerCm * 0.14);
      ctx.strokeRect(x, y, w, h);
    }

    if (opts.display.showLabels || opts.display.showDims) {
      drawLayerAnnotations(
        ctx,
        opts.display.showLabels ? layer.label : null,
        opts.display.showDims ? `${widthCm.toFixed(0)} × ${heightCm.toFixed(0)} cm` : null,
        color,
        { x, y },
        { x: x + w, y: y + h },
        Math.max(12, calibration.pxPerCm * 2.2)
      );
    }
  }

  return canvas;
}

export async function compositeDataUrl(
  calibration: Calibration,
  layers: Layer[],
  opts: CompositeOptions
): Promise<string> {
  const canvas = await renderComposite(calibration, layers, opts);
  return canvas.toDataURL("image/png");
}
