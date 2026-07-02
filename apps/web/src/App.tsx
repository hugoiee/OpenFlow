import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ReqFromGate } from '@/components/gate/ReqFromGate'
import { HomePage } from '@/components/home/HomePage'
import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace'
import { useSettingsStore } from '@/store/useSettingsStore'

function App() {
  // 标题跟随用户填写的 req_from（署名）；未填时回退 OpenFlow。
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  useEffect(() => {
    const name = defaultReqFrom.trim()
    document.title = name ? `OpenFlow - ${name}` : 'OpenFlow'
  }, [defaultReqFrom])

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
