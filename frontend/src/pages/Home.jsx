import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'http://localhost:8000'

function Home() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API}/rooms/active`)
      .then(res => res.json())
      .then(data => {
        setRooms(data)
        setLoading(false)
      })
  }, [])

  async function joinRoom(room) {
    if (!name.trim()) {
      alert('Enter your name first!')
      return
    }
    const res = await fetch(`${API}/users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name }),
    })
    const user = await res.json()
    sessionStorage.setItem('userId', user.id)
    sessionStorage.setItem('displayName', user.display_name)
    navigate(`/room/${room.id}`)
  }

  return (
    <div>
      <h1>Focus Rooms 🎯</h1>
      <input
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      {loading && <p>Loading rooms...</p>}
      {rooms.map(room => (
        <div key={room.id} onClick={() => joinRoom(room)} style={{cursor: 'pointer'}}>
          <p>Room — {Math.floor(room.remaining_seconds / 60)} min left</p>
        </div>
      ))}
    </div>
  )
}

export default Home