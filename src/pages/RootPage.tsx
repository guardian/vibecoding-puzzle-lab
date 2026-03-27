import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { WebContainer, type FileSystemAPI, type WebContainerProcess } from '@webcontainer/api'
import './RootPage.css'

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
            Edit this file and the preview will hot-update.
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

let sharedWebContainer: WebContainer | null = null;
let sharedWebContainerBoot: Promise<WebContainer> | null = null;
let sharedWebContainerConsumers = 0;
let sharedProjectInitialization: Promise<void> | null = null;
let sharedDevServerStart: Promise<string> | null = null;
let sharedDevServerProcess: WebContainerProcess | null = null;
let sharedPreviewUrl: string | null = null;
const maxDevServerLogs = 500;
const sharedDevServerLogBuffer: string[] = [];
const sharedDevServerLogSubscribers = new Set<(line: string) => void>();

function appendDevServerLog(line: string) {
  if (!line) return;

  sharedDevServerLogBuffer.push(line);
  if (sharedDevServerLogBuffer.length > maxDevServerLogs) {
    sharedDevServerLogBuffer.splice(0, sharedDevServerLogBuffer.length - maxDevServerLogs);
  }

  for (const subscriber of sharedDevServerLogSubscribers) {
    subscriber(line);
  }
}

function subscribeToDevServerLogs(subscriber: (line: string) => void) {
  sharedDevServerLogSubscribers.add(subscriber);

  for (const line of sharedDevServerLogBuffer) {
    subscriber(line);
  }

  return () => {
    sharedDevServerLogSubscribers.delete(subscriber);
  };
}

async function streamDevServerOutput(process: WebContainerProcess) {
  const reader = process.output.getReader();

  try {
    let pending = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (pending.trim().length > 0) {
          appendDevServerLog(pending.trimEnd());
        }
        break;
      }

      const chunk = `${pending}${value}`;
      const lines = chunk.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) {
        appendDevServerLog(line);
      }
    }
  } catch (error) {
    appendDevServerLog(`[system] failed to read dev server output: ${String(error)}`);
  } finally {
    reader.releaseLock();
  }
}

async function streamCommandOutput(process: WebContainerProcess, prefix: string) {
  const reader = process.output.getReader();

  try {
    let pending = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (pending.trim().length > 0) {
          appendDevServerLog(`${prefix} ${pending.trimEnd()}`);
        }
        break;
      }

      const chunk = `${pending}${value}`;
      const lines = chunk.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length > 0) {
          appendDevServerLog(`${prefix} ${line}`);
        }
      }
    }
  } catch (error) {
    appendDevServerLog(`[system] failed to read command output: ${String(error)}`);
  } finally {
    reader.releaseLock();
  }
}

async function pathExists(fs: FileSystemAPI, path: string): Promise<boolean> {
  try {
    await fs.readFile(path, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  container: WebContainer,
  command: string,
  args: string[],
  cwd = '/',
) {
  appendDevServerLog(`[setup] $ ${command} ${args.join(' ')}`);
  const process = await container.spawn(command, args, {
    cwd,
    env: {
      npm_config_yes: 'true',
      CI: '1',
    },
  });
  const outputTask = streamCommandOutput(process, '[setup]');
  const exitCode = await process.exit;
  appendDevServerLog(`[setup] command exited with code ${exitCode}`);
  await outputTask;

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode}`);
  }
}

async function ensureProjectInitialized(container: WebContainer): Promise<void> {
  if (sharedProjectInitialization) {
    return sharedProjectInitialization;
  }

  sharedProjectInitialization = (async () => {
    const fs = container.fs;

    if (!(await pathExists(fs, '/app/package.json'))) {
      await runCommand(container, 'npm', ['create', 'vite@latest', 'app', '--', '--template', 'react', '--no-interactive']);
      await runCommand(container, 'npm', ['install'], '/app');
      await runCommand(container, 'npm', ['install', '-D', 'tailwindcss@3', 'postcss', 'autoprefixer'], '/app');
      await runCommand(container, 'npm', ['install', '@headlessui/react'], '/app');
      await runCommand(container, 'npx', ['tailwindcss', 'init', '-p'], '/app');
    } else {
      appendDevServerLog('[setup] existing /app project detected, skipping scaffold step');
    }

    await fs.writeFile(
      '/app/tailwind.config.js',
      `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
    );

    await fs.writeFile(
      '/app/src/index.css',
      `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
`,
    );
  })().catch((error) => {
    sharedProjectInitialization = null;
    throw error;
  });

  return sharedProjectInitialization;
}

async function ensureDevServerRunning(container: WebContainer): Promise<string> {
  if (sharedPreviewUrl) {
    return sharedPreviewUrl;
  }

  if (sharedDevServerStart) {
    return sharedDevServerStart;
  }

  sharedDevServerStart = new Promise<string>(async (resolve, reject) => {
    appendDevServerLog('[system] starting Vite dev server...');
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out waiting for Vite dev server'));
    }, 30000);

    const unsubscribe = container.on('server-ready', (_port, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      sharedPreviewUrl = url;
      appendDevServerLog(`[system] dev server ready at ${url}`);
      resolve(url);
    });

    try {
      sharedDevServerProcess = await container.spawn(
        'npm',
        ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'],
        { cwd: '/app' },
      );

      void streamDevServerOutput(sharedDevServerProcess);

      sharedDevServerProcess.exit.then((exitCode) => {
        appendDevServerLog(`[system] dev server exited with code ${exitCode}`);
        if (exitCode !== 0 && !settled) {
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error(`Vite dev server exited with code ${exitCode}`));
        }

        sharedDevServerProcess = null;
        sharedDevServerStart = null;
        sharedPreviewUrl = null;
      }).catch(() => {
        appendDevServerLog('[system] dev server process ended unexpectedly');
        sharedDevServerProcess = null;
        sharedDevServerStart = null;
        sharedPreviewUrl = null;
      });
    } catch (error) {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    }
  }).catch((error) => {
    sharedDevServerStart = null;
    throw error;
  });

  return sharedDevServerStart;
}

async function writeRootFile(container: WebContainer, sourceCode: string) {
  await container.fs.writeFile('/app/src/main.jsx', sourceCode);
}

async function acquireWebContainer(): Promise<WebContainer> {
  sharedWebContainerConsumers += 1;

  if (!sharedWebContainerBoot) {
    sharedWebContainerBoot = WebContainer.boot().then((container) => {
      sharedWebContainer = container;

      if (sharedWebContainerConsumers === 0) {
        container.teardown();
        sharedWebContainer = null;
        sharedWebContainerBoot = null;
      }

      return container;
    }).catch((error) => {
      sharedWebContainerBoot = null;
      sharedWebContainer = null;
      throw error;
    });
  }

  return sharedWebContainerBoot;
}

function releaseWebContainer() {
  sharedWebContainerConsumers = Math.max(0, sharedWebContainerConsumers - 1);

  if (sharedWebContainerConsumers === 0 && sharedWebContainer) {
    sharedWebContainer.teardown();
    sharedWebContainer = null;
    sharedWebContainerBoot = null;
    sharedProjectInitialization = null;
    sharedDevServerStart = null;
    sharedDevServerProcess = null;
    sharedPreviewUrl = null;
  }
}

enum ContainerState {
    NotReady = 'not_ready',
    Booting = 'booting',
    Busy = 'busy',
    Ready = 'ready',
    Error = 'error',
};

function RootPage() {
  const [code, setCode] = useState(initialCode);
  const [containerState, setContainerState] = useState<ContainerState>(ContainerState.NotReady);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devServerLogs, setDevServerLogs] = useState<string[]>([]);
  const extensions = useMemo(() => [javascript()], [])
  const webContainerRef = useRef<WebContainer | null>(null);
  const logsViewportRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToDevServerLogs((line) => {
      setDevServerLogs((previous) => {
        const next = [...previous, line];
        if (next.length > maxDevServerLogs) {
          return next.slice(next.length - maxDevServerLogs);
        }
        return next;
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!logsViewportRef.current) return;

    logsViewportRef.current.scrollTop = logsViewportRef.current.scrollHeight;
  }, [devServerLogs]);

  useEffect(() => {
    let isDisposed = false;

    async function setupWebContainer() {
        appendDevServerLog('[system] booting WebContainer...');
        setContainerState(ContainerState.Booting);
        const webContainerInstance = await acquireWebContainer();
        webContainerRef.current = webContainerInstance;
        appendDevServerLog('[system] WebContainer boot complete');

        if (isDisposed) return;

        setContainerState(ContainerState.Busy);
        appendDevServerLog('[system] initializing project...');
        await ensureProjectInitialized(webContainerInstance);
        appendDevServerLog('[system] writing /app/src/main.jsx');
        await writeRootFile(webContainerInstance, code);
        appendDevServerLog('[system] starting preview server...');
        const url = await ensureDevServerRunning(webContainerInstance);

        if (isDisposed) return;

        setPreviewUrl(url);
        setContainerState(ContainerState.Ready);
    }

    setupWebContainer().catch((error) => {
        console.error('Error setting up WebContainer:', error)
      appendDevServerLog(`[system] setup error: ${String(error)}`);
        setContainerState(ContainerState.Error);
    });

    return () => {
      isDisposed = true;
      webContainerRef.current = null;
      releaseWebContainer();
    }
  }, []);

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
  
  return (
    <main className="root-page">
      <section className="editor-column" aria-label="JavaScript editor">
        <CodeMirror
          value={code}
          height="100%"
          extensions={extensions}
          onChange={(value) => setCode(value)}
        />
      </section>

      <section className="preview-column" aria-label="Preview panel">
        <span>Container state: {containerState}</span>
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

export default RootPage
