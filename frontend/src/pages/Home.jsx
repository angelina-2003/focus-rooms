import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import WinsModal from '../components/WinsModal.jsx'
import WhitelistModal from '../components/WhitelistModal.jsx'

const API = 'http://localhost:8000'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CreateRoomModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(45)
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const token = sessionStorage.getItem('token')
      const decoded = token ? JSON.parse(atob(token.split('.')[1])) : null
      const res = await fetch(`${API}/rooms/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          duration_minutes: duration,
          is_private: isPrivate,
          created_by: decoded?.sub,
        }),
      })
      const room = await res.json()
      onCreated(room)
    } catch {
      setError('Failed to create room. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const durationLabel = duration >= 60
    ? `${Math.floor(duration / 60)}h${duration % 60 > 0 ? ` ${duration % 60}m` : ''}`
    : `${duration}m`

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create a room</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="input-label">Room name</label>
          <input
            className="name-input"
            placeholder="e.g. Morning grind"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            autoFocus
          />

          <label className="input-label">
            Duration — <strong>{durationLabel}</strong>
          </label>
          <input
            type="range"
            min={5}
            max={1440}
            step={5}
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="duration-slider"
          />
          <div className="slider-labels">
            <span>5m</span>
            <span>24h</span>
          </div>

          <div className="toggle-row">
            <div>
              <span className="input-label" style={{ marginBottom: 0 }}>Private room</span>
              <p className="toggle-hint">Only joinable via invite code</p>
            </div>
            <button
              className={`toggle${isPrivate ? ' toggle-on' : ''}`}
              onClick={() => setIsPrivate(p => !p)}
              aria-pressed={isPrivate}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || loading}
          >
            {loading ? 'Creating…' : isPrivate ? 'Create private room' : 'Create room'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InviteCodeModal({ room, onClose, onJoin }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Room created!</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '12px' }}>Share this code with your group:</p>
          <div className="invite-code">{room.invite_code}</div>
          <p className="toggle-hint" style={{ marginTop: '12px' }}>
            Anyone with this code can join the room.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={() => onJoin(room)}>Join now</button>
        </div>
      </div>
    </div>
  )
}

function getWins(name) {
  try { return JSON.parse(localStorage.getItem('fr_wins') ?? '{}')[name] ?? 0 } catch { return 0 }
}

function Home() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createdRoom, setCreatedRoom] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(null)
  const [showWins, setShowWins] = useState(false)
  const [showWhitelist, setShowWhitelist] = useState(false)
  const navigate = useNavigate()

  const token = sessionStorage.getItem('token')
  const decoded = token ? JSON.parse(atob(token.split('.')[1])) : null
  const displayName = decoded?.display_name

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      sessionStorage.setItem('token', urlToken)
      window.history.replaceState({}, '', '/')
      window.location.reload()
      return
    }

    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${API}/rooms/active`)
      .then(res => res.json())
      .then(data => {
        setRooms(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function joinRoom(room) {
    if (joining !== null) return
    setJoining(room.id)
    navigate(`/room/${room.id}`)
  }

  async function joinByCode() {
    setCodeError(null)
    try {
      const res = await fetch(`${API}/rooms/code/${code.trim().toUpperCase()}`)
      if (!res.ok) {
        const err = await res.json()
        setCodeError(err.detail)
        return
      }
      const room = await res.json()
      navigate(`/room/${room.id}`)
    } catch {
      setCodeError('Could not find that room.')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('token')
    localStorage.removeItem('token')
    window.location.reload()
  }

  function handleRoomCreated(room) {
    setShowCreate(false)
    if (room.is_private) {
      setCreatedRoom(room)
    } else {
      setRooms(prev => [...prev, {
        ...room,
        elapsed_seconds: 0,
        remaining_seconds: room.duration_minutes * 60,
      }])
      joinRoom(room)
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
        <div className="header-right">
          {token ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="trophy-count" onClick={() => setShowWins(true)} style={{ cursor: 'pointer' }}>
                <svg width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M7 9.5c-2.2 0-4-1.8-4-4V2h8v3.5c0 2.2-1.8 4-4 4z" stroke="var(--yellow)" strokeWidth="1.3" fill="none"/>
                  <path d="M3 3.5H1.5a1 1 0 0 0 0 2H3M11 3.5h1.5a1 1 0 0 1 0 2H11" stroke="var(--yellow)" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M5 9.5v1.5M9 9.5v1.5M4.5 11h5" stroke="var(--yellow)" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {getWins(displayName)}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{displayName}</span>
              <button className="btn-secondary" onClick={() => setShowWhitelist(true)} title="Whitelist sites">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Whitelist
              </button>
              <button className="btn-secondary" onClick={handleLogout}>Sign out</button>
            </div>
          ) : (
            <a href={`${API}/auth/google`} className="google-btn">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.39 2.4-3.44 2.4-5.88z" fill="#4285F4"/>
                <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a4.8 4.8 0 0 1-7.14-2.52H.96v2.07A8 8 0 0 0 8 16z" fill="#34A853"/>
                <path d="M3.58 9.54A4.8 4.8 0 0 1 3.33 8c0-.53.1-1.05.25-1.54V4.39H.96A8 8 0 0 0 0 8c0 1.29.31 2.51.96 3.61l2.62-2.07z" fill="#FBBC05"/>
                <path d="M8 3.2c1.22 0 2.3.42 3.16 1.24l2.37-2.37A8 8 0 0 0 8 0 8 8 0 0 0 .96 4.39l2.62 2.07A4.77 4.77 0 0 1 8 3.2z" fill="#EA4335"/>
              </svg>
              Sign in
            </a>
          )}
        </div>
      </header>

      <div className="home-body">
        <div className="home-left">
          <h1>Focus together,<br />achieve more.</h1>
          <p className="hero-sub">
            Join an active focus room and stay accountable with others in real time.
          </p>
          <div className="hero-features">
            <div className="hero-feature">
              <span className="hero-feature-dot" style={{ background: 'var(--green)' }} />
              Live distraction tracking
            </div>
            <div className="hero-feature">
              <span className="hero-feature-dot" style={{ background: 'var(--accent)' }} />
              Real-time leaderboard
            </div>
            <div className="hero-feature">
              <span className="hero-feature-dot" style={{ background: 'var(--yellow)' }} />
              Public &amp; private rooms
            </div>
          </div>
        </div>

        <div className="home-right">
          {!token ? (
            <div className="auth-gate">
              <div className="auth-gate-icon">
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                  <rect x="5" y="13" width="20" height="15" rx="3" stroke="var(--accent)" strokeWidth="1.8"/>
                  <path d="M10 13V10a5 5 0 1 1 10 0v3" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="15" cy="20.5" r="2.5" fill="var(--accent)"/>
                </svg>
              </div>
              <p className="auth-gate-title">Sign in to continue</p>
              <p className="auth-gate-sub">You need an account to see and join active focus rooms.</p>
              <a href={`${API}/auth/google`} className="google-btn google-btn-large">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.39 2.4-3.44 2.4-5.88z" fill="#4285F4"/>
                  <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a4.8 4.8 0 0 1-7.14-2.52H.96v2.07A8 8 0 0 0 8 16z" fill="#34A853"/>
                  <path d="M3.58 9.54A4.8 4.8 0 0 1 3.33 8c0-.53.1-1.05.25-1.54V4.39H.96A8 8 0 0 0 0 8c0 1.29.31 2.51.96 3.61l2.62-2.07z" fill="#FBBC05"/>
                  <path d="M8 3.2c1.22 0 2.3.42 3.16 1.24l2.37-2.37A8 8 0 0 0 8 0 8 8 0 0 0 .96 4.39l2.62 2.07A4.77 4.77 0 0 1 8 3.2z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </a>
            </div>
          ) : (
            <div className="rooms-section">
              <div className="rooms-header">
                <span className="section-title">Active rooms</span>
                <div className="rooms-header-right">
                  {!loading && <span className="count-badge">{rooms.length}</span>}
                  <button className="btn-create" onClick={() => setShowCreate(true)}>+ Create</button>
                </div>
              </div>

              <div className="code-join">
                <input
                  className="name-input"
                  placeholder="Enter invite code…"
                  value={code}
                  onChange={e => { setCode(e.target.value); setCodeError(null) }}
                  onKeyDown={e => e.key === 'Enter' && joinByCode()}
                  maxLength={10}
                />
                <button className="btn-primary" onClick={joinByCode} disabled={!code.trim()}>
                  Join
                </button>
              </div>
              {codeError && <p className="error-text">{codeError}</p>}

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
                  <span>Create one to get started.</span>
                </div>
              )}

              {!loading && rooms.length > 0 && (
                <div className="rooms-list">
                  {rooms.map((room, i) => (
                    <button
                      key={room.id}
                      className={`room-card${joining === room.id ? ' joining' : ''}`}
                      onClick={() => joinRoom(room)}
                      disabled={joining !== null}
                      style={{ animationDelay: `${i * 0.06}s` }}
                    >
                      <div className="room-left">
                        <div className="room-indicator" />
                        <div className="room-info">
                          <span className="room-name">{room.name}</span>
                          <span className="room-meta">
                            {room.participant_count ?? 0} {(room.participant_count ?? 0) === 1 ? 'person' : 'people'} focusing
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
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreated={handleRoomCreated}
        />
      )}

      {showWins && (
        <WinsModal wins={getWins(displayName)} displayName={displayName} onClose={() => setShowWins(false)} />
      )}

      {showWhitelist && (
        <WhitelistModal onClose={() => setShowWhitelist(false)} />
      )}

      {createdRoom && (
        <InviteCodeModal
          room={createdRoom}
          onClose={() => setCreatedRoom(null)}
          onJoin={(room) => {
            setCreatedRoom(null)
            joinRoom(room)
          }}
        />
      )}
    </div>
  )
}

export default Home