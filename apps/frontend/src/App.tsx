import { Route, Routes } from 'react-router'
import Index from './pages/Index'
import { PuzzleEditor } from './pages/PuzzleEditor'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/bundle/:bundleId/:mode" element={<PuzzleEditor />} />
    </Routes>
  )
}

export default App
