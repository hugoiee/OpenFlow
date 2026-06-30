import { Navigate, Route, Routes } from 'react-router-dom'
import { ReqFromGate } from '@/components/gate/ReqFromGate'
import { HomePage } from '@/components/home/HomePage'
import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace'

function App() {
  return (
    <ReqFromGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:id" element={<ProjectWorkspace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ReqFromGate>
  )
}

export default App
