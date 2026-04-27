import { createBrowserRouter, RouterProvider } from 'react-router'
import Index from './pages/Index'
import { PuzzleEditor } from './pages/PuzzleEditor'
import { UserInfoLoader } from './components/UserInfoLoader'

const router = createBrowserRouter([
  {
    path: "/",
    Component: Index,
    loader: UserInfoLoader,
  },
  {
    path: "/bundle/:bundleId/:mode",
    Component: PuzzleEditor,
    loader: UserInfoLoader,
  }
]);
 
function App() {
  return (
    <RouterProvider router={router} />
  )
}

export default App
