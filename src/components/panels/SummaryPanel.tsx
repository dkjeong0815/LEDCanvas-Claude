import { useStore } from "../../state/store";
import {
  cabinetCount,
  layerResolutionPx,
  layerSizeCm,
} from "../../lib/cabinets";

export default function SummaryPanel() {
  const layers = useStore((s) => s.layers);

  if (layers.length === 0) return null;

  const rows = layers.map((l) => {
    const size = layerSizeCm(l);
    const whole = layerResolutionPx(l);
    return {
      id: l.id,
      label: l.label,
      cabinets: cabinetCount(l),
      pitch: l.pixelPitchMm,
      size: `${size.widthCm.toFixed(0)} × ${size.heightCm.toFixed(0)}`,
      resolution: `${whole.widthPx} × ${whole.heightPx}`,
      fullResolution: (whole.widthPx * whole.heightPx).toLocaleString("ko-KR"),
      areaM2: (size.widthCm * size.heightCm) / 10000,
    };
  });

  return (
    <section className="panel panel-result">
      <h2>요약</h2>
      <div className="table-scroll">
        <table className="summary">
          <thead>
            <tr>
              <th className="col-text">레이어</th>
              <th>캐비닛</th>
              <th>픽셀 피치</th>
              <th>크기(cm)</th>
              <th>해상도(px)</th>
              <th className="col-total">전체 해상도(px)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="col-text">{r.label}</td>
                <td>{r.cabinets}</td>
                <td>{r.pitch}</td>
                <td>{r.size}</td>
                <td>{r.resolution}</td>
                <td className="col-total">{r.fullResolution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
