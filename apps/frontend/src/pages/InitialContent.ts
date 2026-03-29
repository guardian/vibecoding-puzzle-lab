export const initialCode = (displayText?: string) => `import { createRoot } from 'react-dom/client'
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
            ${displayText || "We are waiting for the model to generate your code bundle. This can take up to a minute, so please be patient. Once it's ready, the preview will load here and you can interact with it in real time as we make updates to the code."}
          </div>
        )}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
`

export const securePreviewDoc = `<!doctype html>
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