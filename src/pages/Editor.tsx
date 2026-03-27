import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import type { WebContainer } from '@webcontainer/api'
import {
  ContainerState,
  createWebContainerRuntimeState,
  maxDevServerLogs,
  releaseWebContainer,
  setupWebContainer,
  writeRootFile,
} from './webcontainer'
import './Editor.css'
import { ModelResponse } from './models'

const initialCode = `import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Switch } from '@headlessui/react'
import './index.css'

function App() {
  const [enabled, setEnabled] = useState(true)

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 grid place-items-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-xl">
        <h1 className="text-2xl font-bold">WebContainer Playground</h1>
        <p className="mt-2 text-slate-300">Tailwind + Headless UI are ready.</p>

        <div className="mt-6 flex items-center justify-between">
          <span className="font-medium">Enable preview card</span>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            className={
              (enabled ? 'bg-emerald-500' : 'bg-slate-600') +
              ' relative inline-flex h-6 w-11 items-center rounded-full transition'
            }
          >
            <span
              className={
                (enabled ? 'translate-x-6' : 'translate-x-1') +
                ' inline-block h-4 w-4 transform rounded-full bg-white transition'
              }
            />
          </Switch>
        </div>

        {enabled && (
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-700/50 p-4">
            We are waiting for the model to generate your code bundle. This can take up to a minute, so please be patient. Once it's ready, the preview will load here and you can interact with it in real time as we make updates to the code.
          </div>
        )}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
`
const securePreviewDoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; base-uri 'none'; form-action 'none';"
    />
    <meta name="referrer" content="no-referrer" />
  </head>
  <body></body>
</html>`

enum ModelState {
  Ready = 'ready',
  Thinking = 'thinking',
  Error = 'error',
  Query = 'query'
}
function Editor() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const [code, setCode] = useState("");
  const [containerState, setContainerState] = useState<ContainerState>(ContainerState.NotReady)
  const [modelState, setModelState] = useState<ModelState>(ModelState.Ready);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [devServerLogs, setDevServerLogs] = useState<string[]>([])
  const extensions = useMemo(() => [javascript({ jsx: true })], [])
  const webContainerRef = useRef<WebContainer | null>(null)
  const runtimeRef = useRef(createWebContainerRuntimeState())
  const logsViewportRef = useRef<HTMLPreElement | null>(null)

  const [progressBarValue, setProgressBarValue] = useState(0);
  const [progressBarTotal, setProgressBarTotal] = useState(0);

  function addDevServerLog(line: string) {
    if (!line) return

    setDevServerLogs((previous) => {
      const next = [...previous, line]
      if (next.length > maxDevServerLogs) {
        return next.slice(next.length - maxDevServerLogs)
      }
      return next
    })
  }

  useEffect(() => {
    if (!logsViewportRef.current) return;

    logsViewportRef.current.scrollTop = logsViewportRef.current.scrollHeight;
  }, [devServerLogs]);

  useEffect(()=>{
    const asyncLoad = async () => {
      const response = await fetch(`/api/bundle/${bundleId}`);
      if(response.status===404) {
        const initialPrompt = localStorage.getItem('temp-prompt-cache') ?? '';
        if(initialPrompt) {
          setModelState(ModelState.Thinking);
          const modelResponse = await fetch(`/api/${bundleId}/prompt`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ promptText: initialPrompt }),
          });
          if(modelResponse.ok) {
            const parsedResponse = ModelResponse.safeParse(await modelResponse.json());
            if(parsedResponse.success) {
              setCode(parsedResponse.data.jsx ?? initialCode);
              setModelState(ModelState.Ready);
            } else {
              console.error('Failed to parse model response:', parsedResponse.error);
              setCode(initialCode);
              setModelState(ModelState.Error);
            }
          } else {
            console.error('Model generation request failed with status:', modelResponse.status);
            setCode(initialCode);
            setModelState(ModelState.Error);
          }
        } else {
          setCode(initialCode);
        }
      } else {
        setCode("// Loading is not implemented yet, but we did find the bundle :)")
      }
    }

    asyncLoad().catch((error) => {
      console.error('Error loading bundle:', error);
      setCode(initialCode);
      setModelState(ModelState.Error);
    });
  }, [bundleId]);

  useEffect(() => {
    let isDisposed = false;

    async function initializeContainer() {
      const { container, previewUrl: url } = await setupWebContainer(runtimeRef.current, code, addDevServerLog, (stage) => {
        if (stage === 'booting') {
          setContainerState(ContainerState.Booting)
          return
        }

        setContainerState(ContainerState.Busy)
      },(counter, total) => {
        setProgressBarValue(counter ?? 0);
        setProgressBarTotal(total ?? 0);
      }
    )

      if (isDisposed) return

      webContainerRef.current = container
      setPreviewUrl(url)
      setContainerState(ContainerState.Ready)
    }

    initializeContainer().catch((error) => {
      console.error('Error setting up WebContainer:', error)
      addDevServerLog(`[system] setup error: ${String(error)}`)
      setContainerState(ContainerState.Error)
    })

    return () => {
      isDisposed = true;
      webContainerRef.current = null;
      releaseWebContainer(runtimeRef.current)
    }
  }, [bundleId]);

  useEffect(() => {
    async function updateCodeInContainer() {
        const webContainerInstance = webContainerRef.current;
        if (containerState !== ContainerState.Ready || !webContainerInstance) return;

        await writeRootFile(webContainerInstance, code);
    }

    updateCodeInContainer().catch((error) => {
        console.error('Error updating code in WebContainer:', error);
        setContainerState(ContainerState.Error);
    });
  }, [code, containerState]);
  
  const codeDidChange = (value: string) => {
    const timeoutId = setTimeout(()=>setCode(value), 1000);
    return () => clearTimeout(timeoutId);
  }
  
  return (
    <main className="root-page" data-bundle-id={bundleId ?? ''}>
      <section className="editor-column" aria-label="JavaScript editor">
        <CodeMirror
          value={code}
          height="100%"
          extensions={extensions}
          onChange={codeDidChange}
        />
      </section>

      <section className="preview-column" aria-label="Preview panel">
        <div className="state-container">
          <span style={{marginRight: "1em"}}>Container state: {containerState}</span>
          <span>Model state: {modelState}</span>
          {progressBarTotal > 0 && (
            <div className="progress-bar-wrapper">
              <div 
                className="progress-bar" 
                style={{ width: `${(progressBarValue / progressBarTotal) * 100}%` }}
              />
            </div>
          )}
        </div>
        <iframe
          title="Preview"
          className="preview-frame"
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
            {devServerLogs.length > 0 ? devServerLogs.join('\n') : 'No output yet.'}
          </pre>
        </div>
      </section>
    </main>
  )
}

export default Editor
