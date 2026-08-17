import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore, wallBounds } from "../state/store";
import {
  CABINETS,
  cabinetCount,
  effectivePitchMm,
  layerResolutionPx,
  layerSizeCm,
} from "../lib/cabinets";
import { compositeDataUrl } from "../lib/composite";
import WorkspaceView from "./WorkspaceView";

/** CSS defines 1mm as exactly 96/25.4 px, so sizes given in px print predictably. */
const MM_TO_PX = 96 / 25.4;
/** A3 landscape, minus the @page margin declared in the stylesheet. */
const SHEET_WIDTH_MM = 420 - 24;
const SHEET_HEIGHT_MM = 297 - 24;
/** paper-space height of the title block, table and footer around the artwork */
const TITLE_BLOCK_MM = 26;
const FOOTER_MM = 12;
const TABLE_ROW_MM = 9;

export default function PrintView({ onClose }: { onClose: () => void }) {
  const calibration = useStore((s) => s.calibration);
  const background = useStore((s) => s.background);
  const layers = useStore((s) => s.layers);
  const defaultPitchMm = useStore((s) => s.defaultPitchMm);
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);

  // Only the PNG download needs a bitmap; the sheet itself renders live.
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!calibration || !background) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await compositeDataUrl(calibration, layers, { showLabels: true });
        if (!cancelled) setPngUrl(url);
      } catch {
        if (!cancelled) setPngUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calibration, background, layers]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
    []
  );

  if (!calibration) return null;

  const bounds = wallBounds(calibration);

  // Title block, table and footer take fixed height; the arrangement gets the
  // rest of the sheet. Sizes are in px because CSS maps px to mm exactly.
  const viewWidthPx = SHEET_WIDTH_MM * MM_TO_PX;
  const tableMm = TABLE_ROW_MM * (layers.length + 2);
  const viewHeightMm = SHEET_HEIGHT_MM - TITLE_BLOCK_MM - FOOTER_MM - tableMm;
  const viewHeightPx = Math.max(60 * MM_TO_PX, viewHeightMm * MM_TO_PX);

  const totals = layers.reduce(
    (acc, l) => {
      const size = layerSizeCm(l);
      acc.cabinets += cabinetCount(l);
      acc.areaM2 += (size.widthCm * size.heightCm) / 10000;
      return acc;
    },
    { cabinets: 0, areaM2: 0 }
  );

  const title = projectName.trim() || "제목 없음";

  const TitleBlock = () => (
    <header className="sheet-title">
      <div>
        <h1>{title}</h1>
        <p>
          벽면 {bounds.widthCm.toFixed(0)} × {bounds.heightCm.toFixed(0)} cm · 기준{" "}
          {calibration.referenceWidthCm} × {calibration.referenceHeightCm} cm
        </p>
      </div>
      <dl className="sheet-meta">
        <div>
          <dt>LED 면</dt>
          <dd>{layers.length}</dd>
        </div>
        <div>
          <dt>캐비닛</dt>
          <dd>{totals.cabinets}</dd>
        </div>
        <div>
          <dt>작성일</dt>
          <dd>{today}</dd>
        </div>
      </dl>
    </header>
  );

  const rows = layers.map((l) => {
    const size = layerSizeCm(l);
    const whole = layerResolutionPx(l, defaultPitchMm);
    return {
      id: l.id,
      label: l.label,
      cabinet: CABINETS[l.cabinetType].label,
      grid: `${l.cols} × ${l.rows}`,
      count: cabinetCount(l),
      pitch: effectivePitchMm(l, defaultPitchMm),
      size: `${size.widthCm.toFixed(1)} × ${size.heightCm.toFixed(1)}`,
      // The whole layer, cabinet array included.
      resolution: `${whole.widthPx} × ${whole.heightPx}`,
      // Its pixel count — the number a processor is sized by.
      fullResolution: (whole.widthPx * whole.heightPx).toLocaleString("ko-KR"),
      areaM2: (size.widthCm * size.heightCm) / 10000,
    };
  });

  const SpecTable = () => (
    <table className="sheet-table">
      <thead>
        <tr>
          <th>레이어</th>
          <th>캐비닛</th>
          <th>배열</th>
          <th>수량</th>
          <th>픽셀 피치(mm)</th>
          <th>크기(cm)</th>
          <th>해상도(px)</th>
          <th>전체 해상도(px)</th>
          <th>면적(m²)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.label}</td>
            <td>{r.cabinet}</td>
            <td>{r.grid}</td>
            <td>{r.count}</td>
            <td>{r.pitch}</td>
            <td>{r.size}</td>
            <td>{r.resolution}</td>
            <td>{r.fullResolution}</td>
            <td>{r.areaM2.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Rendered outside .app so that hiding the app chrome for print does not
  // also hide the sheets.
  return createPortal(
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <label>
          프로젝트명
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="예: 강남점 로비 LED"
          />
        </label>
        <span className="muted small">A3 가로 · 1장</span>
        <div className="spacer" />
        {pngUrl && (
          <a className="btn btn-ghost btn-sm" href={pngUrl} download={`${title}-합성.png`}>
            PNG 저장
          </a>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          인쇄 · PDF 저장
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="print-doc">
        {/* ---------- sheet 1: presentation ---------- */}
        <section className="print-page">
          <TitleBlock />
          {/* The arrangement itself, rendered by the very component the editor
              uses — not a second drawing of it. */}
          <div className="sheet-workspace">
            <WorkspaceView
              calibration={calibration}
              layers={layers}
              frameWidth={viewWidthPx}
              frameHeight={viewHeightPx}
            />
          </div>
          <SpecTable />
          <footer className="sheet-foot">
            <span>
              LED 면 {layers.length}개 · 캐비닛 합계 {totals.cabinets}개 · 총 면적{" "}
              {totals.areaM2.toFixed(2)} m²
            </span>
            <span>기본 픽셀 피치 {defaultPitchMm} mm</span>
          </footer>
        </section>

      </div>
    </div>,
    document.body
  );
}
