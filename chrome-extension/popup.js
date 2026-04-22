const API = 'https://focus-rooms.onrender.com'
const APP = 'https://focusonit.online'
const SESSION_KEYS = ['token', 'roomId', 'roomName', 'sessionEnd', 'totalDuration', 'distractionCount', 'lastSite']
const ALL_KEYS = ['authToken', 'lastEndedRoomId', 'lastEndedAt', ...SESSION_KEYS]

// ——— Helpers ——————————————————————————————————————————

function pad(n) { return String(n).padStart(2, '0') }
function fmt(s) { if (s <= 0) return '00:00'; return `${pad(Math.floor(s / 60))}:${pad(s % 60)}` }

function decodeToken(jwt) {
  try { return JSON.parse(atob(jwt.split('.')[1])) } catch { return null }
}

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtRoomTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${pad(sec)}`
}

function fmtDuration(min) {
  if (min >= 60) return `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}m` : ''}`
  return `${min}m`
}

// ——— Screens ——————————————————————————————————————————

const SCREENS = ['loading', 'auth', 'home', 'create', 'invite', 'session', 'ended']

function show(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`)
    el.classList.toggle('active', s === name)
  })
}

// ——— State ————————————————————————————————————————————

let state = {
  authToken: null,
  rooms: [],
  roomsLoading: true,
  creating: false,
  isPrivate: false,
  pendingRoom: null,   // room just created (private), waiting for join
  sessionData: {},
}

// ——— Auth ——————————————————————————————————————————————

document.getElementById('btn-google').addEventListener('click', () => {
  chrome.tabs.create({ url: `${API}/auth/google` })
  window.close()
})

document.getElementById('btn-logout').addEventListener('click', () => {
  chrome.storage.local.remove(ALL_KEYS, () => {
    state.authToken = null
    show('auth')
  })
})

// ——— Home ——————————————————————————————————————————————

document.getElementById('btn-create').addEventListener('click', () => {
  // Reset form
  document.getElementById('create-name').value = ''
  document.getElementById('duration-slider').value = 45
  document.getElementById('duration-label').textContent = '45m'
  document.getElementById('create-toggle').classList.remove('on')
  document.getElementById('btn-create-submit').disabled = true
  document.getElementById('create-error').style.display = 'none'
  state.isPrivate = false
  show('create')
})

// Code join
const codeInput = document.getElementById('code-input')
const btnJoinCode = document.getElementById('btn-join-code')
codeInput.addEventListener('input', () => {
  btnJoinCode.disabled = !codeInput.value.trim()
  document.getElementById('code-error').style.display = 'none'
})
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter' && codeInput.value.trim()) joinByCode() })
btnJoinCode.addEventListener('click', joinByCode)

async function joinByCode() {
  const code = codeInput.value.trim().toUpperCase()
  btnJoinCode.disabled = true
  document.getElementById('code-error').style.display = 'none'
  try {
    const res = await fetch(`${API}/rooms/code/${code}`)
    if (!res.ok) {
      const err = await res.json()
      showCodeError(err.detail ?? 'Room not found.')
      return
    }
    const room = await res.json()
    openRoom(room)
  } catch {
    showCodeError('Could not connect to server.')
  } finally {
    btnJoinCode.disabled = false
  }
}

function showCodeError(msg) {
  const el = document.getElementById('code-error')
  el.textContent = msg
  el.style.display = ''
}

// ——— Rooms list ——————————————————————————————————————

let roomsFetchedAt = null   // used to correct stale remaining_seconds in openRoom()

async function fetchRooms() {
  const list = document.getElementById('rooms-list')
  list.innerHTML = `
    <div class="room-card skeleton"></div>
    <div class="room-card skeleton" style="animation-delay:0.1s"></div>
  `
  document.getElementById('rooms-count').style.display = 'none'

  try {
    roomsFetchedAt = Date.now()
    const res = await fetch(`${API}/rooms/active`)
    if (!res.ok) throw new Error()
    state.rooms = await res.json()
    renderRooms()
  } catch {
    list.innerHTML = `<div class="empty"><div class="empty-title">Could not load rooms</div></div>`
  }
}

function renderRooms() {
  const list = document.getElementById('rooms-list')
  const countEl = document.getElementById('rooms-count')

  if (state.rooms.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-title">No active rooms right now</div>
        <div class="empty-sub">Create one to get started.</div>
      </div>`
    countEl.style.display = 'none'
    return
  }

  countEl.textContent = state.rooms.length
  countEl.style.display = ''

  list.innerHTML = ''
  state.rooms.forEach((room, i) => {
    const card = document.createElement('button')
    card.className = 'room-card'
    card.style.animationDelay = `${i * 0.05}s`
    const people = room.participant_count ?? 0
    card.innerHTML = `
      <div class="room-left">
        <div class="room-indicator"></div>
        <div class="room-info">
          <span class="room-name-text">${room.name}</span>
          <span class="room-meta">${people} ${people === 1 ? 'person' : 'people'} focusing</span>
        </div>
      </div>
      <div class="room-right">
        <span class="room-timer">${fmtRoomTime(room.remaining_seconds)}</span>
        <svg class="room-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 10l4-4-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`
    card.addEventListener('click', () => openRoom(room))
    list.appendChild(card)
  })
}

// ——— Open room ————————————————————————————————————————

function openRoom(room) {
  const token = state.authToken
  if (!token) return

  // Correct remaining_seconds for time elapsed since the rooms list was fetched.
  // Code-joined rooms are fetched just-in-time so staleness = 0.
  const staleness = (roomsFetchedAt && room.elapsed_seconds != null)
    ? Math.max(0, Math.floor((Date.now() - roomsFetchedAt) / 1000))
    : 0
  const remaining = Math.max(0, Math.floor(room.remaining_seconds ?? 0) - staleness)

  // totalDuration = elapsed + remaining (constant for the room).
  // elapsed_seconds is now returned by all endpoints after the backend fix.
  const totalDuration = (room.elapsed_seconds != null)
    ? Math.round(room.elapsed_seconds + room.remaining_seconds)
    : (room.duration_minutes != null ? room.duration_minutes * 60 : null)

  const sessionEnd = Date.now() + remaining * 1000

  const sessionData = {
    token,
    roomId: String(room.id),
    roomName: room.name ?? null,
    sessionEnd,
    totalDuration,
    distractionCount: 0,
    lastSite: null,
  }

  chrome.storage.local.remove(['lastEndedRoomId', 'lastEndedAt'])
  chrome.storage.local.set(sessionData)
  chrome.tabs.create({ url: `${APP}/room/${room.id}?ext_token=${encodeURIComponent(token)}` })
  show('session')
  renderSession(sessionData)
}

// ——— Create room ——————————————————————————————————————

const createName = document.getElementById('create-name')
const createSubmit = document.getElementById('btn-create-submit')
const durationSlider = document.getElementById('duration-slider')
const durationLabel = document.getElementById('duration-label')
const createToggle = document.getElementById('create-toggle')

createName.addEventListener('input', () => {
  createSubmit.disabled = !createName.value.trim()
})

durationSlider.addEventListener('input', () => {
  durationLabel.textContent = fmtDuration(Number(durationSlider.value))
})

createToggle.addEventListener('click', () => {
  state.isPrivate = !state.isPrivate
  createToggle.classList.toggle('on', state.isPrivate)
  createSubmit.textContent = state.isPrivate ? 'Create private room' : 'Create room'
})

document.getElementById('btn-create-back').addEventListener('click', () => show('home'))
document.getElementById('btn-create-cancel').addEventListener('click', () => show('home'))

createSubmit.addEventListener('click', async () => {
  if (!createName.value.trim()) return
  const token = state.authToken
  const decoded = decodeToken(token)
  createSubmit.disabled = true
  createSubmit.textContent = 'Creating…'
  document.getElementById('create-error').style.display = 'none'

  try {
    const res = await fetch(`${API}/rooms/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createName.value.trim(),
        duration_minutes: Number(durationSlider.value),
        is_private: state.isPrivate,
        created_by: decoded?.sub,
      }),
    })
    if (!res.ok) throw new Error()
    const room = await res.json()

    if (state.isPrivate) {
      // Show invite code screen
      state.pendingRoom = { ...room, remaining_seconds: room.duration_minutes * 60, elapsed_seconds: 0 }
      document.getElementById('invite-code-display').textContent = room.invite_code
      show('invite')
    } else {
      // Join immediately
      openRoom({ ...room, remaining_seconds: room.duration_minutes * 60, elapsed_seconds: 0 })
    }
  } catch {
    const err = document.getElementById('create-error')
    err.textContent = 'Failed to create room. Try again.'
    err.style.display = ''
  } finally {
    createSubmit.disabled = false
    createSubmit.textContent = state.isPrivate ? 'Create private room' : 'Create room'
  }
})

// ——— Invite screen ————————————————————————————————————

document.getElementById('btn-invite-home').addEventListener('click', () => {
  state.pendingRoom = null
  fetchRooms()
  show('home')
})

document.getElementById('btn-invite-join').addEventListener('click', () => {
  if (state.pendingRoom) openRoom(state.pendingRoom)
})

// ——— Session screen ———————————————————————————————————

document.getElementById('btn-view-app').addEventListener('click', () => {
  const roomId = state.sessionData.roomId
  if (roomId) {
    chrome.tabs.query({ url: `${APP}/room/${roomId}` }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true })
      } else {
        chrome.tabs.create({ url: `${APP}/room/${roomId}?ext_token=${encodeURIComponent(state.authToken)}` })
      }
    })
  }
})

function renderSession(data) {
  state.sessionData = data

  const displayName = decodeToken(data.token)?.display_name
  document.getElementById('sess-room-name').textContent =
    data.roomName || `Room ${String(data.roomId).slice(0, 8)}…`
  document.getElementById('sess-user-name').textContent =
    displayName ? `Signed in as ${displayName}` : 'Session active'

  const now = Date.now()
  const remaining = data.sessionEnd
    ? Math.max(0, Math.floor((data.sessionEnd - now) / 1000))
    : null
  const timerEl = document.getElementById('sess-timer')
  timerEl.textContent = remaining !== null ? fmt(remaining) : '--:--'
  timerEl.className = 'timer-value' + (remaining !== null && remaining <= 60 ? ' urgent' : '')

  const total = data.totalDuration ?? null
  if (total && remaining !== null) {
    const elapsed = Math.max(0, total - remaining)
    const pct = Math.min(100, Math.round((elapsed / total) * 100))
    document.getElementById('sess-progress-fill').style.width = `${pct}%`
    document.getElementById('sess-progress-pct').textContent = `${pct}%`
    document.getElementById('sess-progress-stat').textContent = `${pct}%`
  }

  const count = data.distractionCount ?? 0
  const countEl = document.getElementById('sess-distractions')
  countEl.textContent = count
  countEl.className = 'stat-value' + (count >= 5 ? ' warn' : '')

  const lastEl = document.getElementById('sess-last')
  if (data.lastSite && count > 0) {
    document.getElementById('sess-last-site').textContent = data.lastSite
    lastEl.style.display = ''
  } else {
    lastEl.style.display = 'none'
  }
}

// ——— Init ——————————————————————————————————————————————

function init() {
  chrome.storage.local.get(ALL_KEYS, (data) => {
    state.authToken = data.authToken || data.token || null

    const sessionExpired = data.sessionEnd != null && data.sessionEnd < Date.now()
    const hasSession = !!(data.token && data.roomId) && !sessionExpired

    if (!state.authToken) {
      show('auth')
      return
    }

    if (hasSession) {
      show('session')
      renderSession(data)
      if (!data.sessionEnd || !data.roomName) {
        fetchAndPatchSessionData(data.roomId)
      }
      return
    }

    // sessionEnd expired but storage was never cleaned (FR_SESSION_END didn't fire — tab closed, etc.)
    if (data.token && data.roomId && sessionExpired) {
      const staleRoomId = data.roomId
      const staleRoomName = data.roomName
      chrome.storage.local.set({
        token: null, roomId: null, roomName: null,
        sessionEnd: null, totalDuration: null,
        distractionCount: null, lastSite: null,
        lastEndedRoomId: staleRoomId,
        lastEndedAt: Date.now(),
      })
      showEndedScreen(staleRoomId, staleRoomName)
      return
    }

    // Session just ended (within last 90s) — but only show results if the
    // active tab is NOT already on a room page (which would mean a new session
    // is starting and FR_SESSION_START just hasn't fired yet).
    if (data.lastEndedRoomId && (Date.now() - (data.lastEndedAt ?? 0)) < 90_000) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url ?? ''
        const tabId = tabs[0]?.id
        if (url.includes('/room/') && tabId) {
          // The page is open — ask it to re-send session state, then wait 500ms
          // for the FR_SESSION_START chain to complete before deciding what to show.
          show('loading')
          chrome.tabs.sendMessage(tabId, { type: 'FR_POPUP_CHECK' }, () => void chrome.runtime.lastError)
          setTimeout(() => {
            chrome.storage.local.get(ALL_KEYS, (fresh) => {
              if (fresh.token && fresh.roomId) {
                state.authToken = fresh.authToken || fresh.token
                show('session')
                renderSession(fresh)
                if (!fresh.sessionEnd || !fresh.roomName) {
                  fetchAndPatchSessionData(fresh.roomId)
                }
              } else {
                goHome()
              }
            })
          }, 500)
        } else {
          showEndedScreen(data.lastEndedRoomId, null)
        }
      })
      return
    }

    // No session — show home
    goHome()
  })
}

function goHome() {
  const decoded = decodeToken(state.authToken)
  const name = decoded?.display_name ?? 'You'
  document.getElementById('home-avatar').textContent = getInitials(name)
  document.getElementById('home-username').textContent = name
  show('home')
  fetchRooms()

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'FR_POPUP_CHECK' }, () => {
        void chrome.runtime.lastError
      })
    }
  })
}

async function fetchAndPatchSessionData(roomId) {
  try {
    const fetchedAt = Date.now()
    const res = await fetch(`${API}/rooms/active`)
    if (!res.ok) return
    const rooms = await res.json()
    const room = rooms.find(r => String(r.id) === String(roomId))
    if (!room) return
    // Use fetchedAt (before network roundtrip) for a tighter sessionEnd estimate
    const totalDuration = Math.round(room.elapsed_seconds + room.remaining_seconds)
    const sessionEnd = fetchedAt + room.remaining_seconds * 1000
    chrome.storage.local.set({ roomName: room.name ?? null, sessionEnd, totalDuration })
  } catch (_) {}
}

// Live poll every second
setInterval(() => {
  const activeScreen = document.querySelector('.screen.active')?.id
  if (activeScreen === 'screen-session') {
    chrome.storage.local.get(SESSION_KEYS, (data) => {
      if (data.token && data.roomId) renderSession(data)
    })
  }
}, 1000)

// ——— Ended screen ——————————————————————————————————————

function fmtTime(s) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60); const sec = s % 60
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

async function showEndedScreen(roomId, roomName) {
  document.getElementById('ended-room-name').textContent = roomName || ''
  document.getElementById('ended-board').innerHTML = `
    <div class="ended-loading">
      <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
      Loading results…
    </div>`
  show('ended')

  try {
    const res = await fetch(`${API}/rooms/${roomId}/results`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    renderEndedBoard(data)
  } catch {
    document.getElementById('ended-board').innerHTML =
      `<div class="ended-loading" style="color:var(--text-muted)">Could not load results.</div>`
  }
}

function renderEndedBoard(data) {
  document.getElementById('ended-room-name').textContent = data.room_name || ''
  const board = document.getElementById('ended-board')
  const myName = decodeToken(state.authToken)?.display_name
  const medals = ['🥇', '🥈', '🥉']

  if (!data.participants?.length) {
    board.innerHTML = `<div class="ended-loading" style="color:var(--text-muted)">No participants found.</div>`
    return
  }

  board.innerHTML = ''
  data.participants.forEach((p, i) => {
    const isWinner = i === 0
    const isYou = p.display_name === myName
    const row = document.createElement('div')
    row.className = `ended-row${isWinner ? ' winner' : ''}${isYou ? ' you' : ''}`
    row.style.animationDelay = `${i * 0.05}s`
    row.innerHTML = `
      <span class="ended-rank">${medals[i] ?? `#${i + 1}`}</span>
      <div class="ended-info">
        <span class="ended-name">
          ${p.display_name}
          ${isYou ? '<span class="you-tag">you</span>' : ''}
        </span>
        <span class="ended-stat">▲ ${fmtTime(p.focused_seconds)} focused &middot; ▼ ${fmtTime(p.distracted_seconds)} distracted</span>
      </div>
      <span class="ended-pct">${p.focus_pct}%</span>`
    board.appendChild(row)
  })
}

document.getElementById('btn-ended-new').addEventListener('click', () => {
  const decoded = decodeToken(state.authToken)
  const name = decoded?.display_name ?? 'You'
  document.getElementById('home-avatar').textContent = getInitials(name)
  document.getElementById('home-username').textContent = name
  chrome.storage.local.remove(['lastEndedRoomId', 'lastEndedAt'])
  show('home')
  fetchRooms()
})

// ——— Storage change listener ————————————————————————————

chrome.storage.onChanged.addListener((changes) => {
  // Auth token just arrived (Google OAuth completed)
  if (changes.authToken?.newValue && !state.authToken) {
    state.authToken = changes.authToken.newValue
    init()
    return
  }

  // New session started — roomId changed (same token or new token)
  if (changes.roomId?.newValue) {
    chrome.storage.local.get(ALL_KEYS, (data) => {
      state.authToken = data.authToken || data.token
      show('session')
      renderSession(data)
      if (!data.sessionEnd || !data.roomName) {
        fetchAndPatchSessionData(data.roomId)
      }
    })
    return
  }

  // Session ended — roomId was removed
  if (changes.roomId && !changes.roomId.newValue) {
    const endedRoomId = state.sessionData?.roomId
    const endedRoomName = state.sessionData?.roomName
    state.sessionData = {}
    if (endedRoomId) {
      showEndedScreen(endedRoomId, endedRoomName)
    } else {
      init()
    }
  }
})

init()
