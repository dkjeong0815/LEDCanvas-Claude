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
  fit: "contain" | "cover",
  /** CSS filter string, matching what the editor puts on the element */
  filter?: string
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
  // Set after the backing fill so the filter touches the picture only, the way
  // a CSS filter on the content element does.
  if (filter) ctx.filter = filter;
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
 * Mirrors screenFilter() in WorkspaceView, so the PNG shows the panel at the
 * brightness the arrangement was judged at.
 */
function screenFilter(display: DisplayOptions) {
  if (!(display.screen > 0)) return undefined;
  const a = display.screen;
  return `brightness(${1 + a * 0.45}) contrast(${1 + a * 0.35}) saturate(${1 + a * 0.3})`;
}

/**
 * Lays the shading and the light spill under a face, mirroring the CSS in
 * WorkspaceView — both scale with the face's drawn width, and both run all the
 * way round the face.
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
  type Pass = { color: string; blur: number; spread: number; offsetY: number; screen?: boolean };
  const passes: Pass[] = [];

  if (display.glow > 0 && glowColor) {
    // Screen-blended, matching the editor: light adds to the wall rather than
    // covering it. Wide wash first, tight rim over it.
    passes.push({ color: `rgba(${glowColor}, ${display.glow * 0.55})`, blur: w * 0.34, spread: w * 0.07, offsetY: 0, screen: true });
    passes.push({ color: `rgba(${glowColor}, ${display.glow})`, blur: w * 0.1, spread: w * 0.025, offsetY: 0, screen: true });
  }

  if (display.shadow) {
    const b = w * display.shadowAmount;
    const a = (base: number) => Math.min(1, base * display.shadowAmount);
    passes.push({ color: `rgba(0, 0, 0, ${a(0.2)})`, blur: b * 0.065, spread: 0, offsetY: w * 0.022 });
    passes.push({ color: `rgba(0, 0, 0, ${a(0.3)})`, blur: b * 0.028, spread: 0, offsetY: w * 0.008 });
    passes.push({ color: `rgba(0, 0, 0, ${a(0.5)})`, blur: b * 0.01, spread: 0, offsetY: 0 });
  }

  if (!passes.length) return;

  // The caster is parked far off-canvas and the shadow is offset back onto the
  // face, so the rectangle itself is never painted. Filling it in place would
  // lay an opaque block wherever the spread grows it — a hard black band around
  // the face rather than shade falling away from it.
  const PARK = 1e5;

  for (const pass of passes) {
    ctx.save();
    ctx.shadowColor = pass.color;
    ctx.shadowBlur = pass.blur;
    ctx.shadowOffsetX = -PARK;
    ctx.shadowOffsetY = pass.offsetY;
    if (pass.screen) ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "#000";
    ctx.fillRect(
      x - pass.spread + PARK,
      y - pass.spread,
      w + pass.spread * 2,
      h + pass.spread * 2
    );
    ctx.restore();
  }
}

/**
 * Draws the label chip and size caption exactly the way the editor overlays
 * them, so a printed sheet reads as the same picture the user arranged.
 */
function drawLayerAnnotations(
  ctx: CanvasRenderingContext2D,
  label: string,
  sizeText: string,
  color: string,
  topLeft: Point,
  bottomRight: Point,
  fontPx: number
) {
  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  const padding = fontPx * 0.42;
  const chipHeight = fontPx * 1.5;
  const chipWidth = ctx.measureText(label).width + padding * 2;
  ctx.fillStyle = color;
  ctx.fillRect(topLeft.x, topLeft.y, chipWidth, chipHeight);
  ctx.fillStyle = "#0b1220";
  ctx.fillText(label, topLeft.x + padding, topLeft.y + chipHeight / 2);

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
        drawFitted(ctx, img, x, y, w, h, layer.content.fitMode, screenFilter(opts.display));
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

    if (opts.display.annotations) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, calibration.pxPerCm * 0.14);
      ctx.strokeRect(x, y, w, h);
    }

    if (opts.display.annotations) {
      drawLayerAnnotations(
        ctx,
        layer.label,
        `${widthCm.toFixed(0)} × ${heightCm.toFixed(0)} cm`,
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
