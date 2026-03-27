import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import './RootPage.css'

const initialCode = `// Start coding\n`
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

function RootPage() {
  const [code, setCode] = useState(initialCode)
  const extensions = useMemo(() => [javascript()], [])

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
        <iframe
          title="Preview"
          className="preview-frame"
          srcDoc={securePreviewDoc}
          sandbox=""
          referrerPolicy="no-referrer"
          allow="camera 'none'; geolocation 'none'; microphone 'none'; payment 'none'; usb 'none'; fullscreen 'none';"
        />
      </section>
    </main>
  )
}

export default RootPage
