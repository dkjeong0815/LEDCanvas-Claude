import { useCallback, useEffect, useState } from "react";
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

  // Fullscreen can also be left with Esc or the browser's own UI, so the label
  // follows the document's actual state rather than a local toggle.
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

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

        <div style={{ display: "flex", gap: 8 }}>
          {background && (
            <button className="btn btn-ghost" onClick={reset}>
              새로 시작
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={toggleFullscreen}
            title={isFullscreen ? "전체 화면 종료 (Esc)" : "전체 화면"}
            aria-pressed={isFullscreen}
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ marginRight: 6, verticalAlign: "-2px" }}
            >
              {isFullscreen ? (
                <>
                  <path d="M6 1.5V6H1.5" />
                  <path d="M10 14.5V10h4.5" />
                </>
              ) : (
                <>
                  <path d="M1.5 6V1.5H6" />
                  <path d="M14.5 10v4.5H10" />
                </>
              )}
            </svg>
            {isFullscreen ? "전체 화면 종료" : "전체 화면"}
          </button>
        </div>
      </header>

      <main className="app-main">
        {step === "upload" && <UploadScreen />}
        {step === "calibrate" && <CalibrateScreen />}
        {step === "edit" && <EditorScreen />}
      </main>
    </div>
  );
}
