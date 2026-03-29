import { useState } from "react";
import { ContainerState } from "../utils/webcontainer";
import "./Editor.css";
import { PreviewFrame, type PreviewError } from "../components/PreviewFrame";
import { ModelState } from "../utils/api";
import { Editor } from "../components/Editor";

interface EngineerViewProps {
  bundleId: string;
  setModelState: (state: ModelState) => void;
  modelState: ModelState;
  code: string;
  setCode: (code: string) => void;
  modelNotes: string[];
  setModelNotes: (notes: string[]) => void;
  containerState: ContainerState;
  setContainerState: (state: ContainerState) => void;
  lastPreviewError: PreviewError | null;
  setLastPreviewError: (error: PreviewError | null) => void;
  devServerLogs: string[];
  setDevServerLogs: (logs: string[]) => void;
  handlePreviewError: (error: PreviewError | null) => void;
}

function EngineerView({
  bundleId,
  modelState,
  code,
  setCode,
  containerState,
  setContainerState,
  lastPreviewError,
  setDevServerLogs,
  handlePreviewError
}: EngineerViewProps) {
  const [progressBarValue, setProgressBarValue] = useState(0);
  const [progressBarTotal, setProgressBarTotal] = useState(0);

  return (
    <main className="root-page">
      <section
        className="editor-column"
        aria-label="JavaScript editor"
      >
        <Editor code={code} onChange={setCode} readOnly={modelState !== ModelState.Ready} wrapLines={false} />
      </section>

      <section className="preview-column" aria-label="Preview panel">
        <div className="state-container">
          <span style={{ marginRight: "1em" }}>
            Container state: {containerState}
          </span>
          <span>Model state: {modelState}</span>
          <span>
            Last preview error:{" "}
            {lastPreviewError ? lastPreviewError.kind : "none"}
          </span>
          {progressBarTotal > 0 && (
            <div className="progress-bar-wrapper">
              <div
                className="progress-bar"
                style={{
                  width: `${(progressBarValue / progressBarTotal) * 100}%`,
                }}
              />
            </div>
          )}
          </div>
          <PreviewFrame
            bundleId={bundleId}
            codeDidChange={setCode}
            code={code}
            onPreviewError={handlePreviewError}
            setProgressBarValue={setProgressBarValue}
            setProgressBarTotal={setProgressBarTotal}
            containerStateDidChange={setContainerState}
            logsDidChange={(logs)=>setDevServerLogs(logs)}
          />
      </section>
    </main>
  );
}

export default EngineerView;
