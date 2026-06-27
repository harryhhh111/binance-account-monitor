import { Routes, Route } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <Toaster position="top-right" />
    </>
  )
}
