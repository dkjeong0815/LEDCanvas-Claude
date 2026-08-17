import { useStore } from "./state/store";
import UploadScreen from "./components/UploadScreen";
import CalibrateScreen from "./components/CalibrateScreen";
import EditorScreen from "./components/EditorScreen";

const STEPS = [
  { key: "upload", label: "배경사진" },
  { key: "calibrate", label: "스케일 보정" },
  { key: "edit", label: "LED 배치" },
] as const;

export default function App() {
  const step = useStore((s) => s.step);
  const background = useStore((s) => s.background);
  const reset = useStore((s) => s.reset);

  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>LED Canvas</h1>
            <p>배경사진 한 장 위에 LED 캐비닛을 실제 크기로 배치합니다</p>
          </div>
        </div>

        <ol className="steps" aria-label="진행 단계">
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              className={i === activeIndex ? "current" : i < activeIndex ? "done" : ""}
              aria-current={i === activeIndex ? "step" : undefined}
            >
              <span className="step-index">{i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>

        {background && (
          <button className="btn btn-ghost" onClick={reset}>
            새로 시작
          </button>
        )}
      </header>

      <main className="app-main">
        {step === "upload" && <UploadScreen />}
        {step === "calibrate" && <CalibrateScreen />}
        {step === "edit" && <EditorScreen />}
      </main>
    </div>
  );
}
