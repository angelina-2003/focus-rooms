import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Room from './pages/Room.jsx'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={
        <ProtectedRoute>
          <Room />
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default App
