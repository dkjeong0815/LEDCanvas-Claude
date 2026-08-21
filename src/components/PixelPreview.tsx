import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../state/store";
import { DEFAULT_PIXEL_PITCH, layerSizeCm } from "../lib/cabinets";
import {
  MODULE_HEIGHT_CM,
  MODULE_WIDTH_CM,
  boxDownsample,
  defaultEmitterRatio,
  fillRatio,
  packageFor,
  previewGeometry,
  sourceRectFor,
} from "../lib/pixelPreview";
import { screenFilter } from "../lib/faceFilter";

const MAX_CANVAS_PX = 1400;
const SIDE_MARGIN_PX = 80;

/**
 * One LED module of the selected face, at a scale where a single LED covers
 * several screen pixels.
 *
 * The arrangement view cannot answer what 1.5 mm buys over 1.8 mm: there an LED
 * is a fraction of a screen pixel, so drawing its grid gives moiré instead of
 * structure and every fine pitch looks alike. A module blown up across the
 * window is small enough that the pixel structure is real.
 *
 * It takes the window rather than the sidebar because that is what the maths
 * demands. A 320 mm module in a 308 px column puts 1.2 mm LEDs at 1.2 px each —
 * below the point where a grid can be drawn at all.
 */
export default function PixelPreview({ onClose }: { onClose: () => void }) {
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const display = useStore((s) => s.display);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const patchRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const centreRef = useRef({ x: 0.5, y: 0.5 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState<{ cols: number; rows: number } | null>(null);

  const layer = layers.find((l) => l.id === selectedLayerId) ?? layers[0] ?? null;
  const content = layer?.content ?? null;
  const pitchMm = layer?.pixelPitchMm ?? DEFAULT_PIXEL_PITCH;
  const pack = packageFor(pitchMm);
  const emitterRatio = defaultEmitterRatio(pitchMm);
  const height = Math.round((width * MODULE_HEIGHT_CM) / MODULE_WIDTH_CM);

  useEffect(() => {
    const measure = () =>
      setWidth(Math.min(MAX_CANVAS_PX, Math.max(320, window.innerWidth - SIDE_MARGIN_PX)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer || !content || width <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A live video if this face is playing one, so the module moves with it;
    // otherwise the still. Reading the element the editor already has beats
    // decoding the same file a second time.
    const live =
      content.kind === "video"
        ? (document.querySelector(
            'video[data-layer-id="' + layer.id + '"]'
          ) as HTMLVideoElement | null)
        : null;
    const playing = !!live && live.videoWidth > 0;
    const source: CanvasImageSource | null = playing ? live : imageRef.current;
    if (!source) return;

    const srcW = playing ? live.videoWidth : imageRef.current?.naturalWidth ?? 0;
    const srcH = playing ? live.videoHeight : imageRef.current?.naturalHeight ?? 0;
    if (!srcW || !srcH) return;

    const face = layerSizeCm(layer);
    const geo = previewGeometry({
      pitchMm,
      regionWidthCm: MODULE_WIDTH_CM,
      regionHeightCm: MODULE_HEIGHT_CM,
      canvasWidthPx: canvas.width,
      canvasHeightPx: canvas.height,
    });

    const rect = sourceRectFor({
      contentWidth: srcW,
      contentHeight: srcH,
      faceWidthCm: face.widthCm,
      faceHeightCm: face.heightCm,
      patchWidthCm: geo.widthCm,
      patchHeightCm: geo.heightCm,
      centre: centreRef.current,
      fitMode: content.fitMode,
    });

    // Step one: lift the module at the content's own resolution. Clamped to the
    // picture, with the destination shifted to match, so a module hanging past a
    // 비율 유지 picture shows unlit LEDs rather than a stretched edge.
    const patch = (patchRef.current ??= document.createElement("canvas"));
    patch.width = Math.max(1, Math.round(rect.sw));
    patch.height = Math.max(1, Math.round(rect.sh));
    const pctx = patch.getContext("2d", { willReadFrequently: true });
    if (!pctx) return;
    pctx.fillStyle = "#05070a";
    pctx.fillRect(0, 0, patch.width, patch.height);

    const scale = patch.width / rect.sw;
    const x0 = Math.max(0, rect.sx);
    const y0 = Math.max(0, rect.sy);
    const x1 = Math.min(srcW, rect.sx + rect.sw);
    const y1 = Math.min(srcH, rect.sy + rect.sh);
    if (x1 > x0 && y1 > y0) {
      pctx.drawImage(
        source,
        x0,
        y0,
        x1 - x0,
        y1 - y0,
        (x0 - rect.sx) * scale,
        (y0 - rect.sy) * scale,
        (x1 - x0) * scale,
        (y1 - y0) * scale
      );
    }

    // Step two: one sample per LED, averaged over the area it covers. This is
    // where a coarse pitch loses detail, and it has to be our own averaging —
    // see boxDownsample for what the browser's downscale does instead.
    const leds = boxDownsample(
      pctx.getImageData(0, 0, patch.width, patch.height),
      geo.cols,
      geo.rows
    );
    const scratch = (scratchRef.current ??= document.createElement("canvas"));
    scratch.width = geo.cols;
    scratch.height = geo.rows;
    const sctx = scratch.getContext("2d");
    if (!sctx) return;
    const ledImage = sctx.createImageData(geo.cols, geo.rows);
    ledImage.data.set(leds.data);
    sctx.putImageData(ledImage, 0, 0);

    // Step three: blow those LEDs up without inventing detail between them.
    ctx.filter = screenFilter(display) ?? "none";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scratch, 0, 0, geo.cols, geo.rows, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
    ctx.imageSmoothingEnabled = true;

    // Step four: the dark matrix between LEDs, inclusive of both ends — the
    // half-gaps at the border belong to the LEDs just outside the module.
    if (geo.gapPx > 0) {
      ctx.globalAlpha = geo.gapAlpha;
      ctx.fillStyle = "#05070a";
      for (let c = 0; c <= geo.cols; c++) {
        ctx.fillRect(c * geo.ledPx - geo.gapPx / 2, 0, geo.gapPx, canvas.height);
      }
      for (let r = 0; r <= geo.rows; r++) {
        ctx.fillRect(0, r * geo.ledPx - geo.gapPx / 2, canvas.width, geo.gapPx);
      }
      ctx.globalAlpha = 1;
    }

    setShown((prev) =>
      prev && prev.cols === geo.cols && prev.rows === geo.rows
        ? prev
        : { cols: geo.cols, rows: geo.rows }
    );
  }, [layer, content, width, pitchMm, display]);

  // The still is loaded once and kept. A video is read live off the editor's
  // own element, so it needs nothing here.
  useEffect(() => {
    if (!content) {
      imageRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      draw();
    };
    img.src = content.posterUrl;
    return () => {
      cancelled = true;
    };
  }, [content, draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Only a playing video needs repainting; a still module is drawn once and
  // stays right until something about it changes.
  useEffect(() => {
    if (content?.kind !== "video") return;
    let frame = requestAnimationFrame(function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [content?.kind, draw]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const from = dragRef.current;
    if (!from || !layer || width <= 0) return;
    const face = layerSizeCm(layer);
    // Drag moves the module by what the pointer covered, in wall terms.
    const cmPerPx = MODULE_WIDTH_CM / width;
    const c = centreRef.current;
    centreRef.current = {
      x: Math.min(1, Math.max(0, c.x - ((e.clientX - from.x) * cmPerPx) / face.widthCm)),
      y: Math.min(1, Math.max(0, c.y - ((e.clientY - from.y) * cmPerPx) / face.heightCm)),
    };
    dragRef.current = { x: e.clientX, y: e.clientY };
    draw();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  return createPortal(
    <div className="pixel-overlay">
      <header className="pixel-head">
        <div>
          <h2>픽셀 미리보기</h2>
          <p className="muted small">
            {layer ? layer.label : "레이어 없음"} · LED 모듈 한 장 ({MODULE_WIDTH_CM} ×{" "}
            {MODULE_HEIGHT_CM} cm)
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          닫기
        </button>
      </header>

      {!content ? (
        <p className="muted">이 레이어에 콘텐츠를 올리면 실제 픽셀 구조를 볼 수 있습니다.</p>
      ) : (
        <>
          <div className="pixel-stage">
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{ width, height }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <footer className="pixel-foot muted small">
            <span>픽셀 피치 {pitchMm} mm</span>
            <span>
              {pack.name} · 발광부 {pack.emitterMm} mm
            </span>
            <span>충전율 {Math.round(fillRatio(emitterRatio) * 100)}%</span>
            {shown && (
              <span>
                모듈당 LED {shown.cols} × {shown.rows}
              </span>
            )}
            <span>끌어서 이동</span>
          </footer>
        </>
      )}
    </div>,
    document.body
  );
}
