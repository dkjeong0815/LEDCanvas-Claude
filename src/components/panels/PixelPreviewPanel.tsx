import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";
import { effectivePitchMm, layerSizeCm } from "../../lib/cabinets";
import {
  PATCH_WIDTH_CM,
  boxDownsample,
  defaultEmitterRatio,
  previewGeometry,
  sourceRectFor,
} from "../../lib/pixelPreview";
import { screenFilter } from "../../lib/faceFilter";
import type { Layer } from "../../types";

const ASPECT = 9 / 16;

/**
 * A hand-sized patch of the selected face, blown up until one LED covers
 * several screen pixels.
 *
 * The arrangement view cannot answer what 1.5 mm buys over 1.8 mm — there an
 * LED is a fraction of a screen pixel and every fine pitch looks the same.
 * Here the patch is small enough that the pixel structure is real, so the
 * pitch becomes something you can see rather than a number in a table.
 */
export default function PixelPreviewPanel() {
  const layers = useStore((s) => s.layers);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const defaultPitchMm = useStore((s) => s.defaultPitchMm);
  const display = useStore((s) => s.display);

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const patchRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const centreRef = useRef({ x: 0.5, y: 0.5 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [width, setWidth] = useState(0);
  // null follows the pitch's usual package; a number is the user overruling it.
  const [emitterOverride, setEmitterOverride] = useState<number | null>(null);
  const [shown, setShown] = useState<{ cols: number; rows: number; widthCm: number } | null>(null);

  const layer: Layer | null = layers.find((l) => l.id === selectedLayerId) ?? null;
  const content = layer?.content ?? null;
  const pitchMm = layer ? effectivePitchMm(layer, defaultPitchMm) : defaultPitchMm;
  const emitterRatio = emitterOverride ?? defaultEmitterRatio(pitchMm);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [content]);

  // A different face means the old patch position means nothing.
  useEffect(() => {
    centreRef.current = { x: 0.5, y: 0.5 };
  }, [selectedLayerId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer || !content || width <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A live video if this face is playing one, so the patch moves with it;
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
      emitterRatio,
      regionWidthCm: PATCH_WIDTH_CM,
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

    // Step one: lift the patch at the content's own resolution. Clamped to the
    // picture, with the destination shifted to match, so a patch hanging past a
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

    // Step four: the dark matrix between LEDs. Skipped when they are too small
    // to carry a gap, because at that size it draws moiré, not structure.
    if (geo.gapPx > 0) {
      ctx.globalAlpha = geo.gapAlpha;
      ctx.fillStyle = "#05070a";
      for (let c = 1; c < geo.cols; c++) {
        ctx.fillRect(c * geo.ledPx - geo.gapPx / 2, 0, geo.gapPx, canvas.height);
      }
      for (let r = 1; r < geo.rows; r++) {
        ctx.fillRect(0, r * geo.ledPx - geo.gapPx / 2, canvas.width, geo.gapPx);
      }
      ctx.globalAlpha = 1;
    }

    setShown((prev) =>
      prev && prev.cols === geo.cols && prev.rows === geo.rows && prev.widthCm === geo.widthCm
        ? prev
        : { cols: geo.cols, rows: geo.rows, widthCm: geo.widthCm }
    );
  }, [layer, content, width, pitchMm, emitterRatio, display]);

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

  // Only a playing video needs repainting; a still patch is drawn once and
  // stays right until something about it changes.
  useEffect(() => {
    if (content?.kind !== "video") return;
    let frame = requestAnimationFrame(function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [content?.kind, draw]);

  const height = Math.round(width * ASPECT);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const from = dragRef.current;
    if (!from || !layer || !shown || width <= 0) return;
    const face = layerSizeCm(layer);
    // Drag moves the patch by what the pointer covered, in wall terms.
    const cmPerPx = shown.widthCm / width;
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

  return (
    <section className="panel">
      <h2>픽셀 미리보기</h2>

      {!layer ? (
        <p className="muted small">레이어를 선택하면 실제 픽셀 구조를 볼 수 있습니다.</p>
      ) : !content ? (
        <p className="muted small">콘텐츠를 올리면 실제 픽셀 구조를 볼 수 있습니다.</p>
      ) : (
        <>
          <div className="pixel-preview" ref={boxRef}>
            {width > 0 && (
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
            )}
          </div>

          <label
            className="slider-row"
            title="한 픽셀에서 실제로 빛을 내는 부분의 크기입니다. 피치가 같아도 제품마다 다르므로, 쓰시는 제품에 맞게 조정하세요."
          >
            <span>
              발광부
              <em>
                {(emitterRatio * pitchMm).toFixed(1)} mm · {Math.round(emitterRatio * 100)}%
                {emitterOverride === null ? " 자동" : ""}
              </em>
            </span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.02}
              value={emitterRatio}
              onChange={(e) => setEmitterOverride(Number(e.target.value))}
              onDoubleClick={() => setEmitterOverride(null)}
            />
          </label>

          {shown && (
            <p className="muted small">
              벽 {shown.widthCm.toFixed(1)} cm 폭 · 픽셀 피치 {pitchMm} mm · LED {shown.cols} ×{" "}
              {shown.rows}개 · 끌어서 이동
            </p>
          )}
        </>
      )}
    </section>
  );
}
