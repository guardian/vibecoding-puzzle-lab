import { WebContainer, type FileSystemAPI, type WebContainerProcess } from '@webcontainer/api'
import { downloadFilesystem } from './filesystemSync'

export enum ContainerState {
  NotReady = 'not_ready',
  Booting = 'booting',
  Busy = 'busy',
  Ready = 'ready',
  Error = 'error',
}

export const maxDevServerLogs = 500
export type SetupStage = 'booting' | 'busy'

type LogFn = (line: string) => void

export type WebContainerRuntimeHandles = {
  webContainer: WebContainer | null
  webContainerBoot: Promise<WebContainer> | null
  projectInitialization: Promise<void> | null
  devServerStart: Promise<string> | null
  devServerProcess: WebContainerProcess | null
}

export type WebContainerRuntimeMeta = {
  webContainerConsumers: number
  previewUrl: string | null
}

export type WebContainerRuntimeState = {
  handles: WebContainerRuntimeHandles
  meta: WebContainerRuntimeMeta
}

export type WebContainerRuntimeSnapshot = WebContainerRuntimeMeta & {
  hasWebContainer: boolean
  hasWebContainerBoot: boolean
  hasProjectInitialization: boolean
  hasDevServerStart: boolean
  hasDevServerProcess: boolean
}

export function createWebContainerRuntimeState(): WebContainerRuntimeState {
  return {
    handles: {
      webContainer: null,
      webContainerBoot: null,
      projectInitialization: null,
      devServerStart: null,
      devServerProcess: null,
    },
    meta: {
      webContainerConsumers: 0,
      previewUrl: null,
    },
  }
}

export function getWebContainerRuntimeSnapshot(runtime: WebContainerRuntimeState): WebContainerRuntimeSnapshot {
  return {
    webContainerConsumers: runtime.meta.webContainerConsumers,
    previewUrl: runtime.meta.previewUrl,
    hasWebContainer: runtime.handles.webContainer !== null,
    hasWebContainerBoot: runtime.handles.webContainerBoot !== null,
    hasProjectInitialization: runtime.handles.projectInitialization !== null,
    hasDevServerStart: runtime.handles.devServerStart !== null,
    hasDevServerProcess: runtime.handles.devServerProcess !== null,
  }
}

function logLine(log: LogFn, line: string) {
  if (!line) return
  log(line)
}

async function streamProcessOutput(process: WebContainerProcess, prefix: string | null, log: LogFn) {
  const reader = process.output.getReader()

  try {
    let pending = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (pending.trim().length > 0) {
          logLine(log, prefix ? `${prefix} ${pending.trimEnd()}` : pending.trimEnd())
        }
        break
      }

      const chunk = `${pending}${value}`
      const lines = chunk.split(/\r?\n/)
      pending = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.length) continue
        logLine(log, prefix ? `${prefix} ${line}` : line)
      }
    }
  } catch (error) {
    logLine(log, `[system] failed to read process output: ${String(error)}`)
  } finally {
    reader.releaseLock()
  }
}

async function pathExists(fs: FileSystemAPI, path: string): Promise<boolean> {
  try {
    await fs.readFile(path, 'utf-8')
    return true
  } catch {
    return false
  }
}

function getPreviewIndexHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Puzzle Lab Preview</title>
    <script>
      (function () {
        function postPreviewError(payload) {
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ source: 'puzzle-lab-preview', type: 'preview-error', payload: payload }, '*')
            }
          } catch {
            // Ignore cross-origin issues while reporting errors.
          }
        }

        window.addEventListener(
          'error',
          function (event) {
            var target = event.target
            if (target && target !== window) {
              var tagName = target.tagName ? String(target.tagName) : 'unknown'
              postPreviewError({
                kind: 'dom-error',
                tagName: tagName,
                message: 'Resource failed to load: <' + tagName.toLowerCase() + '>',
              })
              return
            }

            postPreviewError({
              kind: 'runtime-error',
              message: event.message || 'Unknown runtime error',
              fileName: event.filename || '',
              lineNumber: event.lineno || 0,
              columnNumber: event.colno || 0,
              stack: event.error && event.error.stack ? String(event.error.stack) : '',
            })
          },
          true,
        )

        window.addEventListener('unhandledrejection', function (event) {
          var reason = event.reason
          postPreviewError({
            kind: 'unhandled-rejection',
            message: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error && reason.stack ? reason.stack : '',
          })
        })
      })()
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
}

async function runCommand(
  container: WebContainer,
  command: string,
  args: string[],
  log: LogFn,
  cwd = '/',
) {
  logLine(log, `[setup] $ ${command} ${args.join(' ')}`)
  const process = await container.spawn(command, args, {
    cwd,
    env: {
      npm_config_yes: 'true',
      CI: '1',
    },
  })

  const outputTask = streamProcessOutput(process, '[setup]', log)
  const exitCode = await process.exit
  logLine(log, `[setup] command exited with code ${exitCode}`)
  await outputTask

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode}`)
  }
}

async function ensureProjectInitialized(
  runtime: WebContainerRuntimeState,
  container: WebContainer,
  log: LogFn,
  progressFn?: (counter?:number, total?: number) => void
): Promise<void> {
  if (runtime.handles.projectInitialization) {
    return runtime.handles.projectInitialization
  }

  runtime.handles.projectInitialization = (async () => {
    const fs = container.fs

    if (!(await pathExists(fs, '/app/package.json'))) {
      if(progressFn) progressFn(1,9);
      await runCommand(container, 'npm', ['create', 'vite@latest', 'app', '--', '--template', 'react', '--no-interactive'], log)
      if(progressFn) progressFn(2,9);
      await runCommand(container, 'npm', ['install'], log, '/app');
      if(progressFn) progressFn(3,9);
      await runCommand(container, 'npm', ['install', '-D', 'tailwindcss@3', 'postcss', 'autoprefixer'], log, '/app')
      if(progressFn) progressFn(4,9);
      await runCommand(container, 'npm', ['install', '@headlessui/react'], log, '/app');
      if(progressFn) progressFn(5,9);
      await runCommand(container, 'npx', ['tailwindcss', 'init', '-p'], log, '/app')
    } else {
      logLine(log, '[setup] existing /app project detected, skipping scaffold step')
    }

    if(progressFn) progressFn(6,9);
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
    )

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

    await fs.writeFile('/app/index.html', getPreviewIndexHtml())

    if(progressFn) progressFn(7,7);
  })().catch((error) => {
    runtime.handles.projectInitialization = null
    throw error
  })

  return runtime.handles.projectInitialization
}

async function ensureDevServerRunning(
  runtime: WebContainerRuntimeState,
  container: WebContainer,
  log: LogFn,
): Promise<string> {
  if (runtime.meta.previewUrl) {
    return runtime.meta.previewUrl
  }

  if (runtime.handles.devServerStart) {
    return runtime.handles.devServerStart
  }

  runtime.handles.devServerStart = new Promise<string>(async (resolve, reject) => {
    logLine(log, '[system] starting Vite dev server...')
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Timed out waiting for Vite dev server'))
    }, 30000)

    const unsubscribe = container.on('server-ready', (_port, url) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      runtime.meta.previewUrl = url
      logLine(log, `[system] dev server ready at ${url}`)
      resolve(url)
    })

    try {
      runtime.handles.devServerProcess = await container.spawn(
        'npm',
        ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'],
        { cwd: '/app' },
      )

      void streamProcessOutput(runtime.handles.devServerProcess, null, log)

      runtime.handles.devServerProcess.exit
        .then((exitCode) => {
          logLine(log, `[system] dev server exited with code ${exitCode}`)
          if (exitCode !== 0 && !settled) {
            settled = true
            clearTimeout(timeout)
            unsubscribe()
            reject(new Error(`Vite dev server exited with code ${exitCode}`))
          }

          runtime.handles.devServerProcess = null
          runtime.handles.devServerStart = null
          runtime.meta.previewUrl = null
        })
        .catch(() => {
          logLine(log, '[system] dev server process ended unexpectedly')
          runtime.handles.devServerProcess = null
          runtime.handles.devServerStart = null
          runtime.meta.previewUrl = null
        })
    } catch (error) {
      clearTimeout(timeout)
      unsubscribe()
      reject(error)
    }
  }).catch((error) => {
    runtime.handles.devServerStart = null
    throw error
  })

  return runtime.handles.devServerStart
}

export async function readRootFile(container: WebContainer, path: string): Promise<string> {
  return container.fs.readFile(path, 'utf-8');
}

export async function writeRootFile(container: WebContainer, sourceCode: string) {
  await container.fs.writeFile('/app/index.html', getPreviewIndexHtml())
  await container.fs.writeFile('/app/src/main.jsx', sourceCode)
}

export async function acquireWebContainer(runtime: WebContainerRuntimeState): Promise<WebContainer> {
  runtime.meta.webContainerConsumers += 1

  if (!runtime.handles.webContainerBoot) {
    runtime.handles.webContainerBoot = WebContainer.boot()
      .then((container) => {
        runtime.handles.webContainer = container

        if (runtime.meta.webContainerConsumers === 0) {
          container.teardown()
          runtime.handles.webContainer = null
          runtime.handles.webContainerBoot = null
        }

        return container
      })
      .catch((error) => {
        runtime.handles.webContainerBoot = null
        runtime.handles.webContainer = null
        throw error
      })
  }

  return runtime.handles.webContainerBoot
}

export async function setupWebContainer(
  runtime: WebContainerRuntimeState,
  bundleId: string,
  sourceCode: string,
  onCodeLoaded: (code: string) => void,
  onLog: LogFn,
  onStage?: (stage: SetupStage) => void,
  progressFn?: (counter?:number, total?: number) => void
): Promise<{ container: WebContainer; previewUrl: string }> {
  onStage?.('booting')
  logLine(onLog, '[system] booting WebContainer...')
  const container = await acquireWebContainer(runtime)
  logLine(onLog, '[system] WebContainer boot complete')

  onStage?.('busy')
  //Try to load initial filesystem from server, if it fails, we'll just start with an empty container and scaffold the project there
  logLine(onLog, '[system] loading initial filesystem from server...');
  try {
    const result = await downloadFilesystem(container, `/api/bundle/${bundleId}`);
    switch(result) {
      case 'downloaded':
        logLine(onLog, '[system] initial filesystem loaded from server, updating dependencies...');
        await runCommand(container, 'npm', ['install'], onLog, '/app');
        logLine(onLog, '[system] loading code from /app/src/main.jsx')
        const loadedCode = await readRootFile(container, '/app/src/main.jsx');
        if(loadedCode) {
          onCodeLoaded(loadedCode);
        } else {
          throw new Error("Expected to find /app/src/main.jsx in the loaded filesystem, but it was missing or empty");
        }
        break;
      case 'not_found':
        logLine(onLog, '[system] no initial filesystem found on server, initializing new project...');
        await ensureProjectInitialized(runtime, container, onLog, progressFn);
        logLine(onLog, '[system] writing /app/src/main.jsx')
        await writeRootFile(container, sourceCode)
        break;
      case 'error':
        //logLine(onLog, '[system] error loading initial filesystem from server, starting with empty container');
        throw new Error("Could not download and set up bundle");
    }
  } catch(err) {
    logLine(onLog, `[system] failed to load initial filesystem from server: ${String(err)}`);
    throw new Error("Cannot load bundle at present");
  }

  if(progressFn) progressFn(8,9);
  logLine(onLog, '[system] starting preview server...')
  const previewUrl = await ensureDevServerRunning(runtime, container, onLog)
  if(progressFn) progressFn(9,9);
  return { container, previewUrl }
}

export function releaseWebContainer(runtime: WebContainerRuntimeState) {
  runtime.meta.webContainerConsumers = Math.max(0, runtime.meta.webContainerConsumers - 1)

  if (runtime.meta.webContainerConsumers === 0 && runtime.handles.webContainer) {
    runtime.handles.webContainer.teardown()
    runtime.handles.webContainer = null
    runtime.handles.webContainerBoot = null
    runtime.handles.projectInitialization = null
    runtime.handles.devServerStart = null
    runtime.handles.devServerProcess = null
    runtime.meta.previewUrl = null
  }
}
