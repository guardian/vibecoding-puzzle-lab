import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

//We don't use strict mode. That causes things to be rendered twice which upsets the model and container state management and makes it hard to know if the preview has actually crashed or if it's just the double rendering in strict mode.
createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>)
