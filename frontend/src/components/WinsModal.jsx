import { useEffect } from 'react'

function Sparkles() {
  return (
    <div className="wm-sparkles" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="wm-sparkle" style={{ '--i': i }} />
      ))}
    </div>
  )
}

function Zzz() {
  return (
    <div className="wm-zzz" aria-hidden="true">
      <span style={{ '--d': '0s', '--x': '8px' }}>z</span>
      <span style={{ '--d': '0.4s', '--x': '16px' }}>z</span>
      <span style={{ '--d': '0.8s', '--x': '22px' }}>Z</span>
    </div>
  )
}

function WinsModal({ wins, displayName, onClose }) {
  const firstName = displayName?.split(' ')[0] ?? 'you'
  const isWinner = wins > 0

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="wm-overlay" onClick={onClose}>
      <div className={`wm-card ${isWinner ? 'wm-winner' : 'wm-zero'}`} onClick={e => e.stopPropagation()}>
        {isWinner ? (
          <>
            <div className="wm-icon-wrap">
              <Sparkles />
              <span className="wm-emoji wm-emoji-trophy">🏆</span>
            </div>
            <h2 className="wm-title">{wins} {wins === 1 ? 'win' : 'wins'}!</h2>
            <p className="wm-message">
              Crushing it, <strong>{firstName}</strong>! You've topped the leaderboard {wins} {wins === 1 ? 'time' : 'times'}.
              Keep that laser focus — every session is a chance to add another trophy. 🔥
            </p>
            <div className="wm-stat-row">
              <div className="wm-stat">
                <span className="wm-stat-num">{wins}</span>
                <span className="wm-stat-label">session{wins !== 1 ? 's' : ''} won</span>
              </div>
              <div className="wm-stat-divider" />
              <div className="wm-stat">
                <span className="wm-stat-num">👑</span>
                <span className="wm-stat-label">champion</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="wm-icon-wrap">
              <Zzz />
              <span className="wm-emoji wm-emoji-sleep">😴</span>
            </div>
            <h2 className="wm-title">No wins yet...</h2>
            <p className="wm-message">
              Wake up, <strong>{firstName}</strong>! Your trophy shelf is collecting dust.
              Jump into a room, stay off distractions, and finish first, that first 🏆 is closer than you think!
            </p>
            <div className="wm-nudge">
              <span>💡</span> Tip: the less you tab-switch, the higher you rank.
            </div>
          </>
        )}
        <button className="btn-primary wm-cta" onClick={onClose}>
          {isWinner ? 'Keep winning!' : "Let's go! 💪"}
        </button>
      </div>
    </div>
  )
}

export default WinsModal
