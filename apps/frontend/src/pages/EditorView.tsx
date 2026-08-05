import { useContext, useState } from "react";
import { Button } from "@headlessui/react";
import { PreviewFrame, type PreviewError } from "../components/PreviewFrame";
import { ModelState } from "../utils/api";
import { ContainerState } from "../utils/webcontainer";
import { useNavigate } from "react-router";
import "./Editor.css";
import "./EditorView.css";
import { EditableTitle } from "../components/EditableTitle";
import { PuzzleInfoContext } from "../components/PuzzleInfoContext";

interface EditorViewProps {
  bundleId: string;
  code: string;
  onCodeLoaded: (code: string) => void;
  modelState: ModelState;
  containerState: ContainerState;
  setContainerState: (state: ContainerState) => void;
  setDevServerLogs: (logs: string[]) => void;
  handlePreviewError: (error: PreviewError | null) => void;
}

function EditorView({
  bundleId,
  code,
  onCodeLoaded,
  modelState,
  containerState,
  setContainerState,
  setDevServerLogs,
  handlePreviewError,
}: EditorViewProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [progressBarValue, setProgressBarValue] = useState(0);
  const [progressBarTotal, setProgressBarTotal] = useState(0);

  const nav = useNavigate();

  return (
    <main className={`editor-view-page ${isPanelOpen ? "panel-open" : "panel-closed"}`}>
      {!isPanelOpen && (
        <button
          type="button"
          className="panel-expander-floating-button"
          onClick={() => setIsPanelOpen(true)}
          aria-expanded={isPanelOpen}
          aria-controls="editor-view-panel-content"
        >
          Show conversation panel
        </button>
      )}
      {isPanelOpen && (
        <aside className="editor-view-side-panel" aria-label="Model conversation panel">
          <div className="editor-view-panel-header">
            <h2>Model</h2>
            <button
              type="button"
              className="panel-toggle-button"
              onClick={() => setIsPanelOpen(false)}
              aria-expanded={isPanelOpen}
              aria-controls="editor-view-panel-content"
            >
              Hide
            </button>
          </div>

          <div id="editor-view-panel-content" className="editor-view-panel-content">
            <p className="editor-view-panel-kicker">Conversation</p>
            <div className="editor-view-panel-placeholder">TBD.</div>
          </div>
        </aside>
      )}

      <section className="editor-view-main" aria-label="Puzzle preview">
        <header className="editor-view-toolbar">
          <div className="editor-view-toolbar-left">
            <div className="editor-view-status">
              <span>Container: {containerState}</span>
              <span>Model: {modelState}</span>
            </div>
          </div>
          <Button
            className="mode-switch-button"
            onClick={() => nav(`/bundle/${bundleId}/engineer`)}
          >
            Switch to Engineer Mode
          </Button>
        </header>

        {progressBarTotal > 0 && (
          <div className="progress-bar-wrapper editor-view-progress">
            <div
              className="progress-bar"
              style={{
                width: `${(progressBarValue / progressBarTotal) * 100}%`,
              }}
            />
          </div>
        )}

        <div className="editor-view-preview-stage">
          <div className="editor-view-preview-shell">
            <PreviewFrame
              bundleId={bundleId}
              codeDidChange={onCodeLoaded}
              code={code}
              onPreviewError={handlePreviewError}
              setProgressBarValue={setProgressBarValue}
              setProgressBarTotal={setProgressBarTotal}
              containerStateDidChange={setContainerState}
              logsDidChange={(logs) => setDevServerLogs(logs)}
              showLogs={false}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

export default EditorView;
