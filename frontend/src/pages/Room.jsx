import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import WinsModal from '../components/WinsModal.jsx'

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

const CONFETTI_COLORS = ['#7c5ff5', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c']

function Confetti() {
  const pieces = useRef(
    Array.from({ length: 90 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: 6 + Math.random() * 8,
      h: Math.random() > 0.5 ? 6 + Math.random() * 8 : 3 + Math.random() * 5,
      delay: Math.random() * 2.5,
      duration: 2.5 + Math.random() * 2,
      drift: (Math.random() - 0.5) * 120,
      rotation: Math.random() * 360,
    }))
  ).current

  return (
    <div className="confetti-wrap" aria-hidden="true">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: p.h > p.w ? '2px' : '50%',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--rot': `${p.rotation}deg`,
          }}
        />
      ))}
    </div>
  )
}

function getRanked(stats) {
  const now = Date.now()
  const sorted = Object.values(stats)
    .map(s => {
      const totalInRoom = Math.floor((now - s.joinedAt) / 1000)
      const distracted = s.distractedSeconds
      const focused = Math.max(0, totalInRoom - distracted)
      const pct = totalInRoom > 0 ? Math.round((focused / totalInRoom) * 100) : 100
      return { ...s, focused, distracted, pct }
    })
    .sort((a, b) => b.focused - a.focused)

  let rank = 0
  return sorted.map((entry, i) => {
    if (i > 0 && entry.focused < sorted[i - 1].focused) rank = i
    return { ...entry, rank }
  })
}

function formatWinnerNames(names) {
  if (names.length === 1) return `${names[0]} wins`
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)} win`
}

function EndScreen({ stats, displayName, onClose }) {
  const [phase, setPhase] = useState('confetti')
  const ranked = getRanked(stats)
  const winners = ranked.filter(e => e.rank === 0)

  useEffect(() => {
    const t = setTimeout(() => setPhase('results'), 2400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="end-overlay">
      <Confetti />
      {phase === 'results' && (
        <div className="end-card">
          <div className="end-title">
            <span className="end-crown">👑</span>
            Session complete!
          </div>
          <p className="end-subtitle">
            <strong>{formatWinnerNames(winners.map(e => e.name))}</strong> this session
          </p>
          <div className="end-board">
            {ranked.map((entry) => (
              <div
                key={entry.name}
                className={`end-row${entry.rank === 0 ? ' end-row-winner' : ''}${entry.name === displayName ? ' end-row-you' : ''}`}
              >
                <span className="end-row-rank">{['🥇','🥈','🥉'][entry.rank] ?? `#${entry.rank + 1}`}</span>
                <div className="avatar" style={{ background: avatarColor(entry.name), flexShrink: 0 }}>
                  {getInitials(entry.name)}
                </div>
                <div className="end-row-info">
                  <span className="end-row-name">
                    {entry.name}
                    {entry.name === displayName && <span className="you-tag">you</span>}
                  </span>
                  <span className="end-row-stat">▲ {formatTime(entry.focused)} focused · ▼ {formatTime(entry.distracted)} distracted</span>
                </div>
                <span className="end-row-pct">{entry.pct}%</span>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
            Back to home
          </button>
        </div>
      )}
    </div>
  )
}

function getWins(name) {
  try { return JSON.parse(localStorage.getItem('fr_wins') ?? '{}')[name] ?? 0 } catch { return 0 }
}
function addWin(name) {
  try {
    const wins = JSON.parse(localStorage.getItem('fr_wins') ?? '{}')
    wins[name] = (wins[name] ?? 0) + 1
    localStorage.setItem('fr_wins', JSON.stringify(wins))
  } catch {}
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

  const ranked = getRanked(stats)

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
        {ranked.map((entry) => (
          <div key={entry.name} className={`lb-card${entry.rank === 0 && ranked.length > 1 ? ' lb-leader' : ''}`}>
            <div className="lb-rank">{MEDALS[entry.rank] ?? `#${entry.rank + 1}`}</div>
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
  const [roomName, setRoomName] = useState('')
  const [stats, setStats] = useState({})
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showWins, setShowWins] = useState(false)
  const winCredited = useRef(false)
  const ws = useRef(null)
  const feedEndRef = useRef(null)
  const extensionActive = useRef(false)  // true when extension is installed + tracking
  const sessionUpdateRef = useRef(null)  // last FR_SESSION_UPDATE payload, for re-sending on request

  // Allow joining from the extension by passing the JWT as ?ext_token=
  const _urlParams = new URLSearchParams(window.location.search)
  const _extToken = _urlParams.get('ext_token')
  if (_extToken) {
    sessionStorage.setItem('token', _extToken)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const token = sessionStorage.getItem('token')
  const decoded = token ? JSON.parse(atob(token.split('.')[1])) : null
  const userId = decoded?.sub
  const displayName = decoded?.display_name

  useEffect(() => {
    fetch(`${API}/rooms/active`)
      .then(res => res.json())
      .then(data => {
        const room = data.find(r => String(r.id) === String(roomId))
        if (room) {
          setTimeLeft(Math.floor(room.remaining_seconds))
          setRoomName(room.name ?? `Room #${roomId}`)
          const totalDuration = Math.round((room.remaining_seconds ?? 0) + (room.elapsed_seconds ?? 0))
          const update = {
            type: 'FR_SESSION_UPDATE',
            roomName: room.name ?? `Room #${roomId}`,
            sessionEnd: Date.now() + Math.floor(room.remaining_seconds) * 1000,
            totalDuration,
          }
          sessionUpdateRef.current = update
          window.postMessage(update, '*')
        }
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
    if (timeLeft !== 0 || winCredited.current) return
    winCredited.current = true
    const ranked = getRanked(stats)
    const isWinner = ranked.some(e => e.rank === 0 && e.name === displayName)
    if (isWinner) addWin(displayName)
    setSessionEnded(true)
  }, [timeLeft])

  useEffect(() => {
    if (!token) {
      navigate('/')
      return
    }

    // Tell the extension a session is active
    window.postMessage({ type: 'FR_SESSION_START', token, roomId }, '*')

    // Listen for extension to confirm it's active.
    // If it replies, we disable the tab-switch fallback so there's no double-reporting.
    const onExtensionReply = (e) => {
      if (e.data.type === 'FR_EXTENSION_ACTIVE') {
        extensionActive.current = true
        console.log('[FocusRooms] extension active — tab-switch fallback disabled')
      }
      // Popup opened after session started — re-send all session state
      if (e.data.type === 'FR_REQUEST_SESSION') {
        window.postMessage({ type: 'FR_SESSION_START', token, roomId }, '*')
        if (sessionUpdateRef.current) {
          // Recompute sessionEnd so the timer is accurate at re-send time
          const prev = sessionUpdateRef.current
          const elapsed = prev.totalDuration - Math.max(0, Math.floor((prev.sessionEnd - Date.now()) / 1000))
          window.postMessage({
            ...prev,
            sessionEnd: Date.now() + (prev.totalDuration - elapsed) * 1000,
          }, '*')
        }
      }
    }
    window.addEventListener('message', onExtensionReply)

    ws.current = new WebSocket(`ws://localhost:8000/ws/${roomId}?token=${token}`)

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
          text: `${msg.display_name} was on ${msg.site === 'tab_switch' ? 'another tab' : msg.site} for ${formatDuration(msg.duration_seconds)}`,
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
      // Extension is tracking real sites — skip the tab-switch fallback
      if (extensionActive.current) return

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
      window.removeEventListener('message', onExtensionReply)
      window.postMessage({ type: 'FR_SESSION_END' }, '*')
    }
  }, [roomId, token, navigate])

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
            <span className="room-title-text">{roomName || `Room #${roomId}`}</span>
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
          <span className="trophy-count" onClick={() => setShowWins(true)} style={{ cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 9.5c-2.2 0-4-1.8-4-4V2h8v3.5c0 2.2-1.8 4-4 4z" stroke="var(--yellow)" strokeWidth="1.3" fill="none"/>
              <path d="M3 3.5H1.5a1 1 0 0 0 0 2H3M11 3.5h1.5a1 1 0 0 1 0 2H11" stroke="var(--yellow)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M5 9.5v1.5M9 9.5v1.5M4.5 11h5" stroke="var(--yellow)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            {getWins(displayName)}
          </span>
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
                className={`participant${p.user_id === userId ? ' is-you' : ''}`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="avatar" style={{ background: avatarColor(p.display_name) }}>
                  {getInitials(p.display_name)}
                  <span className="online-dot" />
                </div>
                <div className="participant-info">
                  <span className="participant-name">
                    {p.display_name}
                    {p.user_id === userId && (
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

      {showWins && (
        <WinsModal wins={getWins(displayName)} displayName={displayName} onClose={() => setShowWins(false)} />
      )}

      {sessionEnded && (
        <EndScreen
          stats={stats}
          displayName={displayName}
          onClose={() => navigate('/')}
        />
      )}
    </div>
  )
}

export default Room