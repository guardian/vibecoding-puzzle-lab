import { useState, useEffect, useRef } from "react";
import {
  ContainerState,
  createWebContainerRuntimeState,
  maxDevServerLogs,
  releaseWebContainer,
  setupWebContainer,
  writeRootFile,
} from "./webcontainer";
import type { WebContainer } from "@webcontainer/api";
import { securePreviewDoc } from "./InitialContent";

interface PreviewFrameProps {
  code: string;
  onPreviewError: (error: PreviewError | null) => void;
  setProgressBarValue: (value: number) => void;
  setProgressBarTotal: (total: number) => void;
  containerStateDidChange?: (state: ContainerState) => void;
  logsDidChange?: (logs: string[]) => void;
}

export type PreviewError = {
  kind: "dom-error" | "runtime-error" | "unhandled-rejection";
  message: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  stack?: string;
  tagName?: string;
};

export const PreviewFrame: React.FC<PreviewFrameProps> = ({
  code,
  onPreviewError,
  setProgressBarValue,
  setProgressBarTotal,
  containerStateDidChange,
  logsDidChange,
}) => {
  const [previewCrashed, setPreviewCrashed] = useState(false);
  const [lastPreviewError, setLastPreviewError] = useState<PreviewError | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const webContainerRef = useRef<WebContainer | null>(null);
  const runtimeRef = useRef(createWebContainerRuntimeState());
  const logsViewportRef = useRef<HTMLPreElement | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [devServerLogs, setDevServerLogs] = useState<string[]>([]);
  const [containerState, setContainerState] = useState<ContainerState>(
    ContainerState.Booting,
  );

  useEffect(() => {
    if (containerStateDidChange) {
      containerStateDidChange(containerState);
    }
  }, [containerState]);

  useEffect(() => {
    onPreviewError(lastPreviewError);
  }, [lastPreviewError, onPreviewError]);

  useEffect(() => {
    if (logsDidChange) {
      logsDidChange(devServerLogs);
    }
  }, [devServerLogs, logsDidChange]);

  function addDevServerLog(line: string) {
    if (!line) return;

    setDevServerLogs((previous) => {
      const next = [...previous, line];
      if (next.length > maxDevServerLogs) {
        return next.slice(next.length - maxDevServerLogs);
      }
      return next;
    });
  }

  useEffect(() => {
    // A new preview URL means a new dev-server session; clear stale crash state.
    setPreviewCrashed(false);
    setLastPreviewError(null);
  }, [previewUrl]);

  useEffect(() => {
    if (!logsViewportRef.current) return;

    logsViewportRef.current.scrollTop = logsViewportRef.current.scrollHeight;
  }, [devServerLogs]);

  useEffect(() => {
    let isDisposed = false;

    async function initializeContainer() {
      const { container, previewUrl: url } = await setupWebContainer(
        runtimeRef.current,
        code,
        addDevServerLog,
        (stage) => {
          if (stage === "booting") {
            setContainerState(ContainerState.Booting);
            return;
          }

          setContainerState(ContainerState.Busy);
        },
        (counter, total) => {
          setProgressBarValue(counter ?? 0);
          setProgressBarTotal(total ?? 0);
        },
      );

      if (isDisposed) return;

      webContainerRef.current = container;
      setPreviewUrl(url);
      setContainerState(ContainerState.Ready);
    }

    initializeContainer().catch((error) => {
      console.error("Error setting up WebContainer:", error);
      addDevServerLog(`[system] setup error: ${String(error)}`);
      setContainerState(ContainerState.Error);
    });

    return () => {
      isDisposed = true;
      webContainerRef.current = null;
      releaseWebContainer(runtimeRef.current);
    };
  }, []);

  useEffect(() => {
    async function updateCodeInContainer() {
      const webContainerInstance = webContainerRef.current;
      console.log("Updating code in container. Current state:", {
        containerState,
        hasInstance: !!webContainerInstance,
      });
      if (containerState !== ContainerState.Ready || !webContainerInstance)
        return;

      await writeRootFile(webContainerInstance, code);
    }

    updateCodeInContainer().catch((error) => {
      console.error("Error updating code in WebContainer:", error);
      setContainerState(ContainerState.Error);
    });
  }, [code, containerState]);

  useEffect(() => {
    function onPreviewMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "puzzle-lab-preview" || data.type !== "preview-error")
        return;

      // Avoid strict event.source checks; iframe window identity can churn during HMR/reloads.
      if (previewUrl) {
        try {
          const previewOrigin = new URL(previewUrl).origin;
          if (event.origin !== previewOrigin) {
            return;
          }
        } catch {
          return;
        }
      }

      const payload = data.payload;
      if (!payload || typeof payload !== "object") return;

      if (payload.kind === "dom-error") {
        setLastPreviewError({
          kind: "dom-error",
          message: String(payload.message ?? "DOM error"),
          tagName: payload.tagName ? String(payload.tagName) : undefined,
        });
        addDevServerLog(
          `[preview][dom] ${String(payload.message ?? "DOM error")} ${payload.tagName ? `(tag: ${String(payload.tagName)})` : ""}`.trim(),
        );
        return;
      }

      if (payload.kind === "unhandled-rejection") {
        setPreviewCrashed(true);
        setLastPreviewError({
          kind: "unhandled-rejection",
          message: String(payload.message ?? "Unhandled promise rejection"),
          stack: payload.stack ? String(payload.stack) : undefined,
        });
        addDevServerLog(
          `[preview][promise] ${String(payload.message ?? "Unhandled promise rejection")}`,
        );
        if (payload.stack) {
          addDevServerLog(`[preview][promise][stack] ${String(payload.stack)}`);
        }
        return;
      }

      setPreviewCrashed(true);
      setLastPreviewError({
        kind: "runtime-error",
        message: String(payload.message ?? "Runtime error"),
        fileName: payload.fileName ? String(payload.fileName) : undefined,
        lineNumber: Number(payload.lineNumber ?? 0),
        columnNumber: Number(payload.columnNumber ?? 0),
        stack: payload.stack ? String(payload.stack) : undefined,
      });
      const fileName = payload.fileName
        ? ` @ ${String(payload.fileName)}:${String(payload.lineNumber ?? 0)}:${String(payload.columnNumber ?? 0)}`
        : "";
      addDevServerLog(
        `[preview][runtime] ${String(payload.message ?? "Runtime error")}${fileName}`,
      );
      if (payload.stack) {
        addDevServerLog(`[preview][runtime][stack] ${String(payload.stack)}`);
      }
    }

    window.addEventListener("message", onPreviewMessage);
    return () => {
      window.removeEventListener("message", onPreviewMessage);
    };
  }, [previewUrl]);

  return (
    <>
        {previewCrashed ? (
          <span>🛑 The preview crashed. We are trying to find out why....</span>
        ) : undefined}
        {previewCrashed && lastPreviewError && lastPreviewError.message && (
          <div className="error-message">
            <strong>Error message:</strong> {lastPreviewError.message}
          </div>
        )}
      <iframe
        title="Preview"
        className="preview-frame"
        ref={previewFrameRef}
        src={previewUrl ?? undefined}
        srcDoc={previewUrl ? undefined : securePreviewDoc}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        allow="camera 'none'; geolocation 'none'; microphone 'none'; payment 'none'; usb 'none'; fullscreen 'none';"
      />

      <div className="dev-server-logs" aria-label="Dev server logs">
        <div className="dev-server-logs-header">
          <strong>Dev server output (stdout/stderr)</strong>
          <button
            type="button"
            className="clear-logs-button"
            onClick={() => setDevServerLogs([])}
          >
            Clear
          </button>
        </div>
        <pre ref={logsViewportRef} className="dev-server-logs-output">
          {devServerLogs.length > 0
            ? devServerLogs.join("\n")
            : "No output yet."}
        </pre>
      </div>
    </>
  );
};
