import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/components/home/HomePage'
import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/project/:id" element={<ProjectWorkspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
