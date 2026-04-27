import { createBrowserRouter, RouterProvider } from 'react-router';
import { PuzzleEditor } from './pages/PuzzleEditor'
import { UserInfoLoader } from './components/UserInfoLoader'
import StartingPromptForm from './pages/StartingPromptForm';
import { ExistingPuzzlesBrowser } from './pages/ExistingPuzzlesBrowser';

const router = createBrowserRouter([
  {
    path: "/",
    Component: ExistingPuzzlesBrowser,
    loader: UserInfoLoader,
  },
  {
    path: "/new",
    Component: StartingPromptForm,
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
