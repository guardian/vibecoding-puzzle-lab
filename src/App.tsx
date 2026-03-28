import { Route, Routes } from 'react-router'
import Index from './pages/Index'
import EngineerView from './pages/EngineerView'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/bundle/:bundleId" element={<EngineerView />} />
    </Routes>
  )
}

export default App
