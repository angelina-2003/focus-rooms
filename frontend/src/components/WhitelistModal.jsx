import { useState, useEffect } from 'react'

const API = 'https://focus-rooms.onrender.com'

function normaliseDomain(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
}

export default function WhitelistModal({ onClose }) {
  const [sites, setSites] = useState([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const token = sessionStorage.getItem('token')

  useEffect(() => {
    fetch(`${API}/users/me/whitelist`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setSites(d.sites ?? []))
      .catch(() => setError('Could not load whitelist.'))
  }, [])

  async function save(newSites) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/users/me/whitelist`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sites: newSites }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSites(data.sites)
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleAdd() {
    const domain = normaliseDomain(input)
    if (!domain || sites.includes(domain)) { setInput(''); return }
    const next = [...sites, domain]
    setInput('')
    save(next)
  }

  function handleRemove(site) {
    save(sites.filter(s => s !== site))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Whitelisted sites</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            These sites won't be counted as distractions during focus sessions.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="name-input"
              placeholder="e.g. notion.so or youtube.com"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && handleAdd()}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={!input.trim() || saving}
              style={{ flexShrink: 0 }}
            >
              Add
            </button>
          </div>

          {sites.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No sites whitelisted yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sites.map(site => (
                <div
                  key={site}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--bg)', borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{site}</span>
                  <button
                    onClick={() => handleRemove(site)}
                    disabled={saving}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 14, padding: '0 4px',
                    }}
                    aria-label={`Remove ${site}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
