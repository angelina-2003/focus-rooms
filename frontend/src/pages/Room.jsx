import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const API = 'http://localhost:8000'

function formatCountdown(seconds) {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
  '#7c5ff5', '#5b73f5', '#3b9ef5', '#06c4d4',
  '#10c48b', '#e59b0f', '#ef5b5b', '#d455b8',
]

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function formatDuration(seconds) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}

const FEED_ICONS = {
  joined: '→',
  left: '←',
  distracted: '⚡',
}

function FeedItem({ item }) {
  return (
    <div className={`feed-item feed-${item.type}`}>
      <span className="feed-icon" aria-hidden="true">
        {FEED_ICONS[item.type] ?? '•'}
      </span>
      <span className="feed-text">{item.text}</span>
      <span className="feed-time">{item.time}</span>
    </div>
  )
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const MEDALS = ['🥇', '🥈', '🥉']

function Leaderboard({ stats }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = Date.now()
  const ranked = Object.values(stats)
    .map(s => {
      const totalInRoom = Math.floor((now - s.joinedAt) / 1000)
      const distracted = s.distractedSeconds
      const focused = Math.max(0, totalInRoom - distracted)
      const pct = totalInRoom > 0 ? Math.round((focused / totalInRoom) * 100) : 100
      return { ...s, focused, distracted, pct }
    })
    .sort((a, b) => b.focused - a.focused)

  return (
    <aside className="leaderboard-panel">
      <div className="panel-header">
        <span>Leaderboard</span>
        <span className="count-badge">{ranked.length}</span>
      </div>
      <div className="leaderboard-list">
        {ranked.length === 0 && (
          <p className="panel-empty">No data yet…</p>
        )}
        {ranked.map((entry, i) => (
          <div key={entry.name} className={`lb-card${i === 0 && ranked.length > 1 ? ' lb-leader' : ''}`}>
            <div className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</div>
            <div className="avatar" style={{ background: avatarColor(entry.name) }}>
              {getInitials(entry.name)}
            </div>
            <div className="lb-info">
              <span className="lb-name">{entry.name}</span>
              <div className="lb-bar-track">
                <div className="lb-bar-fill" style={{ width: `${entry.pct}%` }} />
              </div>
              <div className="lb-times">
                <span className="lb-focused">▲ {formatTime(entry.focused)}</span>
                <span className="lb-distracted">▼ {formatTime(entry.distracted)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [participants, setParticipants] = useState([])
  const [feed, setFeed] = useState([])
  const [timeLeft, setTimeLeft] = useState(null)
  const [stats, setStats] = useState({})
  const ws = useRef(null)
  const feedEndRef = useRef(null)

  const userId = sessionStorage.getItem('userId')
  const displayName = sessionStorage.getItem('displayName')

  useEffect(() => {
    fetch(`${API}/rooms/active`)
      .then(res => res.json())
      .then(data => {
        const room = data.find(r => String(r.id) === String(roomId))
        if (room) setTimeLeft(Math.floor(room.remaining_seconds))
      })
      .catch(() => {})
  }, [roomId])

  useEffect(() => {
    if (timeLeft === null) return
    if (timeLeft <= 0) return
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [timeLeft === null])

  useEffect(() => {
    if (!userId) {
      navigate('/')
      return
    }

    ws.current = new WebSocket(`ws://localhost:8000/ws/${roomId}/${userId}`)

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

      if (msg.type === 'user_joined' || msg.type === 'user_left') {
        setParticipants(msg.participants)
        setFeed(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: msg.type === 'user_joined' ? 'joined' : 'left',
          text: `${msg.display_name} ${msg.type === 'user_joined' ? 'joined the room' : 'left the room'}`,
          time,
        }])
        if (msg.type === 'user_joined') {
          setStats(prev => ({
            ...prev,
            [msg.display_name]: prev[msg.display_name] ?? { name: msg.display_name, joinedAt: Date.now(), distractedSeconds: 0 },
          }))
        }
      }

      if (msg.type === 'distraction') {
        setFeed(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: 'distracted',
          text: `${msg.display_name} got distracted (${formatDuration(msg.duration_seconds)})`,
          time,
        }])
        setStats(prev => {
          const entry = prev[msg.display_name] ?? { name: msg.display_name, joinedAt: Date.now(), distractedSeconds: 0 }
          return { ...prev, [msg.display_name]: { ...entry, distractedSeconds: entry.distractedSeconds + (msg.duration_seconds ?? 0) } }
        })
      }
    }

    let hiddenAt = null
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
        const duration = Math.round((Date.now() - hiddenAt) / 1000)
        hiddenAt = null
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'distraction',
            site: 'tab_switch',
            duration_seconds: duration,
          }))
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      ws.current?.close()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [roomId, userId, navigate])

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed])

  return (
    <div className="room">
      <header className="room-header">
        <div className="room-header-left">
          <button className="back-btn" onClick={() => navigate('/')} aria-label="Back to home">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="room-title">
            <span className="room-title-text">Room #{roomId}</span>
            <div className="live-badge">
              <span className="live-dot" />
              Live
            </div>
          </div>
        </div>

        <span className={`header-timer${timeLeft !== null && timeLeft <= 60 ? ' header-timer-urgent' : ''}`}>
          {formatCountdown(timeLeft)}
        </span>

        <div className="you-badge">
          <div className="avatar-sm" style={{ background: avatarColor(displayName) }}>
            {getInitials(displayName)}
          </div>
          <span>{displayName}</span>
        </div>
      </header>

      <div className="room-body">
        <aside className="participants-panel">
          <div className="panel-header">
            <span>Participants</span>
            <span className="count-badge">{participants.length}</span>
          </div>
          <div className="participants-list">
            {participants.length === 0 && (
              <p className="panel-empty">Waiting for others to join…</p>
            )}
            {participants.map((p, i) => (
              <div
                key={p.user_id}
                className={`participant${p.user_id === parseInt(userId) ? ' is-you' : ''}`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="avatar" style={{ background: avatarColor(p.display_name) }}>
                  {getInitials(p.display_name)}
                  <span className="online-dot" />
                </div>
                <div className="participant-info">
                  <span className="participant-name">
                    {p.display_name}
                    {p.user_id === parseInt(userId) && (
                      <span className="you-tag">you</span>
                    )}
                  </span>
                  <span className="participant-status">Focusing</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="feed-panel">
          <div className="panel-header">
            <span>Activity</span>
            {feed.length > 0 && <span className="count-badge">{feed.length}</span>}
          </div>
          <div className="feed-list">
            {feed.length === 0 && (
              <p className="panel-empty">
                Activity will appear here once the session starts…
              </p>
            )}
            {feed.map(item => (
              <FeedItem key={item.id} item={item} />
            ))}
            <div ref={feedEndRef} />
          </div>
        </main>

        <Leaderboard stats={stats} />
      </div>

      <footer className="room-footer">
        <div className="focus-status">
          <span className="focus-dot" />
          You&rsquo;re in focus mode, stay on task!
        </div>
      </footer>
    </div>
  )
}

export default Room
