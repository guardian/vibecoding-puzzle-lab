import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { ContainerState } from "../utils/webcontainer";
import "./Editor.css";
import { ModelResponse } from "../utils/models";
import { initialCode } from "./InitialContent";
import { PreviewFrame, type PreviewError } from "../components/PreviewFrame";
import { generateBundleFromCachedPrompt, ModelState } from "../utils/api";


function Editor() {
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
  const extensions = useMemo(() => [javascript({ jsx: true })], []);

  const [progressBarValue, setProgressBarValue] = useState(0);
  const [progressBarTotal, setProgressBarTotal] = useState(0);

  useEffect(() => {
    const asyncDebug = async () => {
      setModelState(ModelState.Thinking);
      const modelResponse = await fetch(`/api/${bundleId}/debug`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsx: code,
          lastError: lastPreviewError
            ? `${lastPreviewError.kind}: ${lastPreviewError.message}`
            : "No error information",
          containerLogs: devServerLogs.join("\n"),
        }),
      });
      if (modelResponse.ok) {
        const parsedResponse = ModelResponse.safeParse(
          await modelResponse.json(),
        );
        if (parsedResponse.success) {
          setCode(parsedResponse.data.jsx ?? code);
          if (parsedResponse.data.explanation)
            setModelNotes((notes) => [
              ...notes,
              parsedResponse.data.explanation ?? "",
            ]);
          setModelState(ModelState.Ready);
          setLastPreviewError(null);
        } else {
          console.error(
            "Failed to parse model response:",
            parsedResponse.error,
          );
          setModelState(ModelState.Error);
        }
      } else {
        console.error(
          "Model debug request failed with status:",
          modelResponse.status,
        );
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

  const codeDidChange = (value: string) => {
    //setCode(value);
    const timeoutId = setTimeout(() => setCode(value), 500);
    return () => clearTimeout(timeoutId);
  };

  return (
    <main className="root-page">
      <section
        className="editor-column"
        aria-label="JavaScript editor"
      >
        <CodeMirror
          value={code}
          height="100%"
          className={wrapLines ? "cm-wrap-lines" : undefined}
          extensions={extensions}
          readOnly={modelState !== ModelState.Ready}
          onChange={codeDidChange}
        />
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
            onPreviewError={(e) => {
              setPreviewCrashed(!!e)
              setLastPreviewError(e);
            }}
            setProgressBarValue={setProgressBarValue}
            setProgressBarTotal={setProgressBarTotal}
            containerStateDidChange={setContainerState}
            logsDidChange={(logs)=>setDevServerLogs(logs)}
          />
      </section>
    </main>
  );
}

export default Editor;
