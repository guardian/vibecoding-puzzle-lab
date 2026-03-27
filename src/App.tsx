import { Route, Routes } from 'react-router'
import RootPage from './pages/RootPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootPage />} />
    </Routes>
  )
}

export default App
