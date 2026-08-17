import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { FAILURE_MESSAGES, detectSheet, resolveA4Size } from "../lib/detectSheet";
import type { Quad } from "../types";

const CORNER_LABELS = ["좌상", "우상", "우하", "좌하"];
/** minimum magnification; raised automatically so the lens never shows less than 1:1 */
const LOUPE_MIN_ZOOM = 4;
const LOUPE_SIZE = 132;

type AutoState = { status: "idle" } | { status: "running" } | { status: "failed"; message: string };

export default function CalibrateScreen() {
  const background = useStore((s) => s.background);
  const referenceKind = useStore((s) => s.referenceKind);
  const setReferenceKind = useStore((s) => s.setReferenceKind);
  const customWidthCm = useStore((s) => s.customWidthCm);
  const customHeightCm = useStore((s) => s.customHeightCm);
  const setCustomSize = useStore((s) => s.setCustomSize);
  const corners = useStore((s) => s.corners);
  const cornersAuto = useStore((s) => s.cornersAuto);
  const addCorner = useStore((s) => s.addCorner);
  const setCorners = useStore((s) => s.setCorners);
  const clearCorners = useStore((s) => s.clearCorners);
  const calibrationError = useStore((s) => s.calibrationError);
  const runCalibration = useStore((s) => s.runCalibration);

  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
  const [auto, setAuto] = useState<AutoState>({ status: "idle" });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);

  // The displayed size changes with the window, the sidebar, zoom — anything.
  // Tracking it continuously is what keeps the corner markers glued to the
  // photo instead of drifting after the first layout.
  //
  // The offset matters just as much: the stage centres the photo, so it is
  // usually letterboxed. Markers are positioned against the stage, so without
  // subtracting where the photo actually starts they sit in the empty band
  // above it — which is exactly what "모서리 위치가 달라짐" looked like.
  useEffect(() => {
    const el = imgRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    const measure = () => {
      const imgBox = el.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      setDisplay({
        width: el.clientWidth,
        height: el.clientHeight,
        offsetX: imgBox.left - stageBox.left,
        offsetY: imgBox.top - stageBox.top,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(stage);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [background?.url]);

  const runAutoDetect = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;
    setAuto({ status: "running" });
    // Deliberately a task, not an animation frame: animation frames never fire
    // in a background tab, which would strand this in "detecting…" forever.
    setTimeout(() => {
      const outcome = detectSheet(img);
      if (!outcome.ok) {
        setAuto({ status: "failed", message: FAILURE_MESSAGES[outcome.reason] });
        return;
      }
      setAuto({ status: "idle" });
      setCorners(outcome.detection.quad, true);
    }, 0);
  }, [setCorners]);

  const handleImageReady = useCallback(() => {
    const el = imgRef.current;
    const stage = stageRef.current;
    if (el && stage) {
      const imgBox = el.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      setDisplay({
        width: el.clientWidth,
        height: el.clientHeight,
        offsetX: imgBox.left - stageBox.left,
        offsetY: imgBox.top - stageBox.top,
      });
    }
    if (referenceKind === "a4" && corners.length === 0) runAutoDetect();
  }, [referenceKind, corners.length, runAutoDetect]);

  if (!background) return null;

  /** natural photo px → position inside the stage (photo offset included) */
  const toDisplay = (p: { x: number; y: number }) => ({
    x: display.offsetX + (p.x / background.naturalWidth) * display.width,
    y: display.offsetY + (p.y / background.naturalHeight) * display.height,
  });

  const toNatural = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const xDisp = clientX - rect.left;
    const yDisp = clientY - rect.top;
    if (xDisp < 0 || yDisp < 0 || xDisp > rect.width || yDisp > rect.height) return null;
    return {
      x: (xDisp / rect.width) * background.naturalWidth,
      y: (yDisp / rect.height) * background.naturalHeight,
      xDisp,
      yDisp,
    };
  };

  const handleStageClick = (e: React.MouseEvent) => {
    if (dragIndex !== null || corners.length >= 4) return;
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    addCorner({ x: p.x, y: p.y });
  };

  // The loupe is what makes a 135 px A4 in a 4000 px photo clickable to the
  // pixel, so it follows the cursor the whole time a corner is being placed —
  // not only once one is already grabbed.
  const lensActive = dragIndex !== null || corners.length < 4;

  const handleStageMove = (e: React.PointerEvent) => {
    if (!lensActive) {
      if (loupe) setLoupe(null);
      return;
    }
    const p = toNatural(e.clientX, e.clientY);
    setLoupe(p ? { x: p.xDisp, y: p.yDisp } : null);
  };

  const handleStageLeave = () => {
    if (dragIndex === null) setLoupe(null);
  };

  const handleCornerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragIndex(index);
    const p = toNatural(e.clientX, e.clientY);
    if (p) setLoupe({ x: p.xDisp, y: p.yDisp });
  };

  const handleCornerMove = (e: React.PointerEvent, index: number) => {
    if (dragIndex !== index) return;
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    const next = corners.slice();
    next[index] = { x: p.x, y: p.y };
    setCorners(next as Quad, false);
    setLoupe({ x: p.xDisp, y: p.yDisp });
  };

  const handleCornerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragIndex(null);
    setLoupe(null);
  };

  // A 4000 px photo shown 810 px wide is already an 5:1 downscale, so a fixed 4x
  // lens would still hide the very pixels the user is trying to hit. Scale the
  // magnification so the lens always resolves the original photo at 1:1 or better.
  const lensZoom = Math.max(
    LOUPE_MIN_ZOOM,
    display.width > 0 ? background.naturalWidth / display.width : LOUPE_MIN_ZOOM
  );

  const complete = corners.length === 4;
  const orientation = complete && referenceKind === "a4" ? resolveA4Size(corners.slice(0, 4) as Quad) : null;

  const proceed = () => {
    const img = imgRef.current;
    if (img) runCalibration(img);
  };

  return (
    <div className="calibrate-layout">
      <div className="photo-pane">
        <div
          className="photo-stage"
          ref={stageRef}
          onClick={handleStageClick}
          onPointerMove={handleStageMove}
          onPointerLeave={handleStageLeave}
          style={{ cursor: complete ? "default" : "crosshair" }}
        >
          <img
            ref={imgRef}
            src={background.url}
            alt="배경사진"
            draggable={false}
            onLoad={handleImageReady}
          />

          {complete && (
            <svg className="quad-overlay" width="100%" height="100%" aria-hidden="true">
              <polygon
                points={corners
                  .map((c) => {
                    const d = toDisplay(c);
                    return `${d.x},${d.y}`;
                  })
                  .join(" ")}
              />
            </svg>
          )}

          {corners.map((c, i) => {
            const d = toDisplay(c);
            return (
              <button
                key={i}
                className={`corner ${dragIndex === i ? "dragging" : ""}`}
                style={{ left: d.x, top: d.y }}
                onPointerDown={(e) => handleCornerDown(e, i)}
                onPointerMove={(e) => handleCornerMove(e, i)}
                onPointerUp={handleCornerUp}
                onPointerCancel={handleCornerUp}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${CORNER_LABELS[i]} 모서리`}
              >
                <span className="corner-tag">{CORNER_LABELS[i]}</span>
              </button>
            );
          })}

          {loupe && (
            <div
              className="loupe"
              style={{
                // loupe.x/y are photo-relative; the element sits in the stage.
                left: display.offsetX + loupe.x,
                top: display.offsetY + loupe.y,
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                backgroundImage: `url(${background.url})`,
                backgroundSize: `${display.width * lensZoom}px ${display.height * lensZoom}px`,
                backgroundPosition: `${-loupe.x * lensZoom + LOUPE_SIZE / 2}px ${
                  -loupe.y * lensZoom + LOUPE_SIZE / 2
                }px`,
              }}
            />
          )}
        </div>
      </div>

      <aside className="side-pane">
        <section className="panel">
          <h2>기준 물체</h2>
          <div className="segmented">
            <button
              className={referenceKind === "a4" ? "active" : ""}
              onClick={() => {
                setReferenceKind("a4");
                clearCorners();
                runAutoDetect();
              }}
            >
              A4 용지
            </button>
            <button
              className={referenceKind === "custom" ? "active" : ""}
              onClick={() => setReferenceKind("custom")}
            >
              직접 입력
            </button>
          </div>

          {referenceKind === "a4" ? (
            <>
              <p className="muted small">
                A4는 21 × 29.7 cm입니다. 용지를 <b>눕혀 붙였는지 세워 붙였는지</b> 자동으로 판별합니다.
              </p>
              {auto.status === "running" && <p className="status">A4 용지를 찾는 중…</p>}
              {auto.status === "failed" && <p className="warn">{auto.message} 아래 사진에서 직접 지정해주세요.</p>}
              <button className="btn btn-ghost btn-sm" onClick={runAutoDetect}>
                자동 인식 다시 실행
              </button>
            </>
          ) : (
            <>
              <p className="muted small">크기를 아는 사각형(액자, 문, 창 등)의 실제 크기를 입력하세요.</p>
              <div className="field-row">
                <label>
                  가로
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={customWidthCm}
                    onChange={(e) => setCustomSize(Number(e.target.value), customHeightCm)}
                  />
                  cm
                </label>
                <label>
                  세로
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={customHeightCm}
                    onChange={(e) => setCustomSize(customWidthCm, Number(e.target.value))}
                  />
                  cm
                </label>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>모서리 지정</h2>
          <p className="muted small">
            사진을 클릭해 <b>좌상 → 우상 → 우하 → 좌하</b> 순서로 네 점을 찍고, 점을 드래그해 정밀하게
            맞추세요. 이 정확도가 전체 치수의 정확도를 좌우합니다.
          </p>
          <div className="corner-status">
            <span className={`badge ${complete ? "ok" : ""}`}>{corners.length} / 4 지정됨</span>
            {cornersAuto && complete && <span className="badge subtle">자동 인식됨</span>}
            {orientation && (
              <span className="badge subtle">{orientation.landscape ? "가로 방향 A4" : "세로 방향 A4"}</span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearCorners} disabled={corners.length === 0}>
            모두 지우기
          </button>
        </section>

        {calibrationError && <p className="error panel-error">{calibrationError}</p>}

        <button className="btn btn-primary btn-block" disabled={!complete} onClick={proceed}>
          정면 보정하고 배치 시작
        </button>
      </aside>
    </div>
  );
}
