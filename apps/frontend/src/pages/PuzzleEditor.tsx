import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { ContainerState } from "../utils/webcontainer";
import { debugFault, generateBundleFromCachedPrompt, loadPuzzleInfo, ModelState, updatePuzzleName } from "../utils/api";
import type { PreviewError } from "../components/PreviewFrame";
import { initialCode } from "./InitialContent";
import EngineerView from "./EngineerView";
import EditorView from "./EditorView";
import { LoginFrame } from "../components/LoginFrame";
import type { PuzzleInfo } from "@puzzle-lab/common-lib";
import { PuzzleInfoContext } from "../components/PuzzleInfoContext";
import { EditableTitle } from "../components/EditableTitle";

export function PuzzleEditor() {
  const { bundleId, mode } = useParams<{ bundleId: string, mode: string }>();
  const [code, setCode] = useState("");
  const [modelNotes, setModelNotes] = useState<string[]>([]);
  const [containerState, setContainerState] = useState<ContainerState>(
  ContainerState.NotReady,
  );
  const [modelState, setModelState] = useState<ModelState>(ModelState.Ready);
  const [previewCrashed, setPreviewCrashed] = useState(false);
  const [lastPreviewError, setLastPreviewError] = useState<PreviewError | null>(null);
  const [devServerLogs, setDevServerLogs] = useState<string[]>([]);
  const [puzzleInfo, setPuzzleInfo] = useState<PuzzleInfo | null>(null);

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

  useEffect(() => {
    if(bundleId) {
      loadPuzzleInfo(bundleId).then((info) => {
        setPuzzleInfo(info);
      });
    } else {
      setPuzzleInfo(null);
    }
  }, [bundleId]);

  //This callback must be memoised to prevent infinite loops in the useEffect that watches previewCrashed
  const handlePreviewError = useCallback((e:PreviewError|null) => {
    console.log(`onPreviewError`, e);
    setPreviewCrashed(!!e)
    setLastPreviewError(e);
  }, []);
  
  const handleTitleChange = (newTitle: string) => {
    if(!bundleId) return;
    updatePuzzleName(bundleId, newTitle).then((updatedInfo) => {
      setPuzzleInfo(updatedInfo);
    }).catch((error) => {
      console.error("Failed to update puzzle name:", error);
    });
  }

  switch(mode) {
    case 'engineer':
      return (
        <LoginFrame inserts={<EditableTitle title={puzzleInfo?.name ?? ""} onTitleChange={handleTitleChange} />}>
          <PuzzleInfoContext.Provider value={puzzleInfo}>
            <EngineerView
              bundleId={bundleId ?? ""}
              setModelState={setModelState}
              modelState={modelState}
              code={code}
              setCode={setCode}
              modelNotes={modelNotes}
              setModelNotes={setModelNotes}
              containerState={containerState}
              setContainerState={setContainerState}
              lastPreviewError={lastPreviewError}
              setLastPreviewError={setLastPreviewError}
              devServerLogs={devServerLogs}
              setDevServerLogs={setDevServerLogs}
              handlePreviewError={handlePreviewError}
            />
          </PuzzleInfoContext.Provider>
        </LoginFrame>
      );
    case 'editor':
      return (
        <LoginFrame inserts={<EditableTitle title={puzzleInfo?.name ?? ""} onTitleChange={handleTitleChange}/>}>
          <PuzzleInfoContext.Provider value={puzzleInfo}>
            <EditorView
              bundleId={bundleId ?? ""}
              code={code}
              onCodeLoaded={setCode}
              modelState={modelState}
              containerState={containerState}
              setContainerState={setContainerState}
              setDevServerLogs={setDevServerLogs}
              handlePreviewError={handlePreviewError}
            />
          </PuzzleInfoContext.Provider>
        </LoginFrame>
      );
      default:
        return <div style={{ padding: "2em" }}>Invalid mode</div>;
  }
}