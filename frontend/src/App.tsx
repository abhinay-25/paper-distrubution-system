import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { InstitutionProvider } from './context/InstitutionContext'
import { AuthProvider } from './context/AuthContext'

function App() {
  return (
    <InstitutionProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </InstitutionProvider>
  )
}

export default App
