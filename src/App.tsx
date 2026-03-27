import { Route, Routes } from 'react-router'
import Index from './pages/Index'
import Editor from './pages/Editor'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/bundle/:bundleId" element={<Editor />} />
    </Routes>
  )
}

export default App
