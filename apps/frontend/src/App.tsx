import { createBrowserRouter, RouterProvider } from 'react-router';
import { PuzzleEditor } from './pages/PuzzleEditor'
import { UserInfoLoader } from './components/UserInfoLoader'
import StartingPromptForm from './pages/StartingPromptForm';
import { HomepageBrowser } from './pages/HomepageBrowser';

const router = createBrowserRouter([
  {
    path: "/",
    Component: HomepageBrowser,
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
