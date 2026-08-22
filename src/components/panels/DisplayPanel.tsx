import { MAX_GLOW, MAX_SCREEN, MAX_SHADOW_AMOUNT, useStore } from "../../state/store";

/**
 * Three switches, and every explanation lives in a tooltip. What the options do
 * is visible the moment they are moved, so spelling it out on the panel only
 * pushed the controls apart.
 */
export default function DisplayPanel() {
  const display = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);

  return (
    <section className="panel">
      <h2>
        <span className="panel-index">3</span>
        표시
      </h2>

      <div className="toggle-rows">
        <label title="레이어 이름, 테두리, 크기 표시를 한꺼번에 끕니다. 옮기거나 크기를 바꿀 때는 해제하세요.">
          <input
            type="checkbox"
            checked={!display.annotations}
            onChange={(e) => setDisplay({ annotations: !e.target.checked })}
          />
          발표 모드
        </label>
        <label title="면이 벽에서 떠 있는 것처럼 그림자를 넣습니다.">
          <input
            type="checkbox"
            checked={display.shadow}
            onChange={(e) => setDisplay({ shadow: e.target.checked })}
          />
          그림자
        </label>
      </div>

      {display.shadow && (
        <label
          className="slider-row"
          title="벽에서 떨어진 정도입니다. 올리면 그림자가 짙어지면서 함께 부드러워집니다."
        >
          <span>
            그림자 세기
            <em>{display.shadowAmount.toFixed(1)}×</em>
          </span>
          <input
            type="range"
            min={0}
            max={MAX_SHADOW_AMOUNT}
            step={0.1}
            value={display.shadowAmount}
            onChange={(e) => setDisplay({ shadowAmount: Number(e.target.value) })}
          />
        </label>
      )}

      <label
        className="slider-row"
        title="LED는 스스로 빛을 내서 벽에 걸린 인쇄물과 다르게 보입니다. 올리면 밝아지고, 검은 부분은 더 깊어지고, 색이 진해집니다. 0이면 원본 그대로입니다."
      >
        <span>
          화면 밝기
          <em>{display.screen.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={MAX_SCREEN}
          step={0.05}
          value={display.screen}
          onChange={(e) => setDisplay({ screen: Number(e.target.value) })}
        />
      </label>

      <label
        className="slider-row"
        title="콘텐츠 평균색이 벽에 번집니다. 어두운 실내 사진에서 효과가 크고, 밝은 사진에서는 거의 드러나지 않습니다."
      >
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
    </section>
  );
}
