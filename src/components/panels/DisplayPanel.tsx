import { MAX_GLOW, useStore } from "../../state/store";

/**
 * What the arrangement shows on top of the content. These options travel to
 * the sheet and the PNG as well — turning the labels off for a client turns
 * them off everywhere, which is the point.
 */
export default function DisplayPanel() {
  const display = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);
  const presentationMode = useStore((s) => s.presentationMode);

  const bare = !display.showLabels && !display.showBorders && !display.showDims && display.shadow;

  return (
    <section className="panel">
      <h2>표시</h2>

      <div className="toggle-rows">
        <label>
          <input
            type="checkbox"
            checked={display.showLabels}
            onChange={(e) => setDisplay({ showLabels: e.target.checked })}
          />
          레이어 이름
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.showBorders}
            onChange={(e) => setDisplay({ showBorders: e.target.checked })}
          />
          테두리
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.showDims}
            onChange={(e) => setDisplay({ showDims: e.target.checked })}
          />
          크기 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.shadow}
            onChange={(e) => setDisplay({ shadow: e.target.checked })}
          />
          그림자
        </label>
      </div>

      <label className="slider-row">
        <span>
          화면 빛 번짐
          <em>{display.glow.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={MAX_GLOW}
          step={0.02}
          value={display.glow}
          onChange={(e) => setDisplay({ glow: Number(e.target.value) })}
        />
      </label>
      <p className="muted small">
        콘텐츠 평균색이 벽에 번집니다. 어두운 실내 사진에서 효과가 크고, 밝은 사진에서는 0이
        자연스럽습니다.
      </p>

      <button
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 10 }}
        onClick={presentationMode}
        disabled={bare}
      >
        발표 모드
      </button>
      <p className="muted small">이름·테두리·크기를 끄고 그림자를 켭니다.</p>

      {!display.showBorders && (
        <p className="muted small">테두리를 끄면 선택 표시도 사라집니다. 옮기거나 크기를 바꿀 때 다시 켜세요.</p>
      )}
    </section>
  );
}
