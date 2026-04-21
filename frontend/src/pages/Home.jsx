import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'http://localhost:8000'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Home() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API}/rooms/active`)
      .then(res => res.json())
      .then(data => {
        setRooms(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function joinRoom(room) {
    if (!name.trim() || joining !== null) return
    setJoining(room.id)
    try {
      const res = await fetch(`${API}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      })
      const user = await res.json()
      sessionStorage.setItem('userId', user.id)
      sessionStorage.setItem('displayName', user.display_name)
      navigate(`/room/${room.id}`)
    } catch {
      setJoining(null)
    }
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="logo">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect width="26" height="26" rx="7" fill="var(--accent)" fillOpacity="0.14" />
            <path d="M13 5.5L8.5 12.5h3.75L11 20.5l6.5-10.5H13.5L14.5 5.5H13z" fill="var(--accent)" />
          </svg>
          FocusRooms
        </div>
        <div className="live-badge">
          <span className="live-dot" />
          Live
        </div>
      </header>

      <div className="home-hero">
        <h1>Focus together,<br />achieve more.</h1>
        <p className="hero-sub">
          Join an active focus room and stay accountable with others in real time.
        </p>
      </div>

      <div className="home-content">
        <div className="input-group">
          <label htmlFor="name-input" className="input-label">Your name</label>
          <input
            id="name-input"
            className="name-input"
            placeholder="e.g. Alex"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && rooms.length >= 1) joinRoom(rooms[0])
            }}
            autoComplete="off"
          />
        </div>

        <div className="rooms-section">
          <div className="rooms-header">
            <span className="section-title">Active rooms</span>
            {!loading && <span className="count-badge">{rooms.length}</span>}
          </div>

          {loading && (
            <div className="rooms-list">
              <div className="room-card skeleton" />
              <div className="room-card skeleton" style={{ animationDelay: '0.1s' }} />
            </div>
          )}

          {!loading && rooms.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🌙</div>
              <p>No active rooms right now</p>
              <span>Check back soon or start a new session.</span>
            </div>
          )}

          {!loading && rooms.length > 0 && (
            <div className="rooms-list">
              {rooms.map((room, i) => (
                <button
                  key={room.id}
                  className={`room-card${joining === room.id ? ' joining' : ''}`}
                  onClick={() => joinRoom(room)}
                  disabled={!name.trim() || joining !== null}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  <div className="room-left">
                    <div className="room-indicator" />
                    <div className="room-info">
                      <span className="room-name">Focus Session #{room.id}</span>
                      <span className="room-meta">
                        {Math.floor(room.remaining_seconds / 60)} min remaining
                      </span>
                    </div>
                  </div>
                  <div className="room-right">
                    <span className="room-timer">{formatTime(room.remaining_seconds)}</span>
                    <svg className="room-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Home
