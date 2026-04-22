console.log('[FocusRooms] content script loaded')

// Track the active room in memory so FR_SESSION_END never needs an async get().
// Without this, there's a race: get() starts → popup opens → sees stale token/roomId → get() completes → set() nulls them too late.
let currentRoomId = null

// Restore in case the content script was reloaded while a session was active
chrome.storage.local.get('roomId', ({ roomId }) => {
  currentRoomId = roomId || null
})

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FR_POPUP_CHECK') {
    window.postMessage({ type: 'FR_REQUEST_SESSION' }, '*')
  }
})

window.addEventListener('message', (event) => {
  if (event.source !== window) return

  if (event.data.type === 'FR_SESSION_START') {
    currentRoomId = event.data.roomId
    // Single atomic write: new session fields + explicit nulls for all stale fields
    chrome.storage.local.set({
      token: event.data.token,
      roomId: event.data.roomId,
      authToken: event.data.token,
      distractionCount: 0,
      lastSite: null,
      roomName: null,
      sessionEnd: null,
      totalDuration: null,
      lastEndedRoomId: null,
      lastEndedAt: null,
    })
    window.postMessage({ type: 'FR_EXTENSION_ACTIVE' }, '*')
  }

  if (event.data.type === 'FR_SESSION_UPDATE') {
    chrome.storage.local.set({
      roomName: event.data.roomName ?? null,
      sessionEnd: event.data.sessionEnd ?? null,
      totalDuration: event.data.totalDuration ?? null,
    })
  }

  if (event.data.type === 'FR_SESSION_END') {
    // Use in-memory roomId — no async get() needed, so no race window
    const roomId = currentRoomId
    currentRoomId = null
    chrome.storage.local.set({
      lastEndedRoomId: roomId || null,
      lastEndedAt: roomId ? Date.now() : null,
      token: null,
      roomId: null,
      roomName: null,
      sessionEnd: null,
      totalDuration: null,
      distractionCount: null,
      lastSite: null,
    })
  }
})
