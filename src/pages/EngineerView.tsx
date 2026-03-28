import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { ContainerState } from "../utils/webcontainer";
import "./Editor.css";
import { initialCode } from "./InitialContent";
import { PreviewFrame, type PreviewError } from "../components/PreviewFrame";
import { debugFault, generateBundleFromCachedPrompt, ModelState } from "../utils/api";
import { Editor } from "../components/Editor";

function EngineerView() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const [code, setCode] = useState("");
  const [modelNotes, setModelNotes] = useState<string[]>([]);
  const [containerState, setContainerState] = useState<ContainerState>(
    ContainerState.NotReady,
  );
  const [modelState, setModelState] = useState<ModelState>(ModelState.Ready);
  const [wrapLines, setWrapLines] = useState(false);
  const [previewCrashed, setPreviewCrashed] = useState(false);
  const [lastPreviewError, setLastPreviewError] = useState<PreviewError | null>(
    null,
  );
  const [devServerLogs, setDevServerLogs] = useState<string[]>([]);


  const [progressBarValue, setProgressBarValue] = useState(0);
  const [progressBarTotal, setProgressBarTotal] = useState(0);

  useEffect(() => {
    const asyncDebug = async () => {
      if(!bundleId) return;
      setModelState(ModelState.Thinking);
      try {
      const modelResponse = await debugFault({
        bundleId,
        lastPreviewError,
        code,
        devServerLogs,
      })
        setCode(modelResponse.jsx ?? code);
        if (modelResponse.explanation) {
          setModelNotes((notes) => [
            ...notes,
            modelResponse.explanation ?? "",
          ]);
        }
        setModelState(ModelState.Ready);
        setLastPreviewError(null);
      } catch (err) {
        console.error("Debugging failed:", err);
        setModelState(ModelState.Error);
      }
      setPreviewCrashed(false);
    };

    if (previewCrashed) {
      asyncDebug().catch((error) => {
        console.error("Error during debugging:", error);
        setModelState(ModelState.Error);
      });
    }
  }, [previewCrashed]);

  useEffect(() => {
    const asyncLoad = async () => {
      if(!bundleId) return;
      try {
        const response = await fetch(`/api/bundle/${bundleId}`);
        await response.body?.cancel(); // We only care about the status right now, so we can cancel the body stream to save resources
        if(response.status === 404) {
          setModelState(ModelState.Thinking);
          const modelResponse = await generateBundleFromCachedPrompt(bundleId);
          setCode(modelResponse.jsx ?? initialCode);
          if(modelResponse.explanation) setModelNotes([modelResponse.explanation]);
          setModelState(ModelState.Ready);
        }
      } catch(err) {
        console.error("Unable to generate code");
        setCode(initialCode);
        setModelState(ModelState.Error);
      }
    }

    asyncLoad().catch((error) => {
      console.error("Error loading bundle:", error);
      setCode(initialCode);
      setModelState(ModelState.Error);
    });
  }, [bundleId]);


  //This callback must be memoised to prevent infinite loops in the useEffect that watches previewCrashed
  const handlePreviewError = useCallback((e:PreviewError|null) => {
    console.log(`onPreviewError`, e);
    setPreviewCrashed(!!e)
    setLastPreviewError(e);
  }, []);
  
  return (
    <main className="root-page">
      <section
        className="editor-column"
        aria-label="JavaScript editor"
      >
        <Editor code={code} onChange={setCode} readOnly={modelState !== ModelState.Ready} wrapLines={wrapLines} />
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
          <label>
            <input
              type="checkbox"
              checked={wrapLines}
              onChange={(event) => setWrapLines(event.target.checked)}
            />
            Wrap lines
          </label>
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
