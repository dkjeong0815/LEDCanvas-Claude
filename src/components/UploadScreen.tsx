import { useCallback, useRef, useState } from "react";
import { useStore } from "../state/store";

export default function UploadScreen() {
  const setBackground = useStore((s) => s.setBackground);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("이미지 파일만 사용할 수 있습니다.");
        return;
      }
      setError(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        URL.revokeObjectURL(url);
        setError("이미지를 열 수 없습니다. 다른 파일로 시도해주세요.");
        return;
      }
      setBackground({ url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    },
    [setBackground]
  );

  return (
    <div className="screen-centre">
      <section
        className={`upload-card ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="upload-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 34V10a2 2 0 0 1 2-2h32a2 2 0 0 1 2 2v24" strokeLinecap="round" />
            <path d="M6 34l11-10 8 7 6-5 11 8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="31" cy="17" r="3" />
            <path d="M24 44v-12M19 37l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2>배경사진 업로드</h2>
        <p className="muted">
          LED를 설치할 벽면 사진 1장을 올려주세요. 벽과 <b>같은 평면</b>에 A4 용지를 붙여 함께 촬영하면
          다음 단계에서 실제 크기가 자동으로 잡힙니다.
        </p>

        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          사진 선택
        </button>
        <p className="muted small">또는 이 영역에 파일을 끌어다 놓으세요</p>

        {error && <p className="error">{error}</p>}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <p className="privacy-note">
          사진은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.
        </p>
      </section>
    </div>
  );
}
