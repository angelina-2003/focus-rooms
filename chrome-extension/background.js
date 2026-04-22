console.log('[FocusRooms] background service worker started')

// Capture JWT from OAuth callback and from main app login
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const url = tab.url ?? ''
  // Matches both http://localhost:5173/?token=... and http://localhost:5173?token=...
  const match = url.match(/localhost:5173[^?]*\?.*[?&]token=([^&]+)/)
  if (match) {
    const token = decodeURIComponent(match[1])
    chrome.storage.local.set({ authToken: token })
    console.log('[FocusRooms] auth token captured from tab')
  }
})

const API = 'http://localhost:8000'

let tabStartTime = null
let currentDomain = null


function getDomain(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace('www.', '')
  } catch {
    return null
  }
}


function shouldIgnore(domain) {
  if (!domain) return true
  if (domain === 'localhost') return true
  if (domain.includes('focusrooms')) return true
  return false
}


async function handleTabSwitch(newUrl) {
  const { token, roomId } = await chrome.storage.local.get(['token', 'roomId'])

  if (!token || !roomId) {
    // No active session — reset state so stale timing doesn't carry over
    currentDomain = null
    tabStartTime = null
    return
  }

  const newDomain = getDomain(newUrl)
  const now = Date.now()

  if (currentDomain && tabStartTime && !shouldIgnore(currentDomain)) {
    const duration = Math.round((now - tabStartTime) / 1000)
    console.log('[FocusRooms] reporting distraction — site:', currentDomain, 'duration:', duration)
    if (duration > 3) {
      reportDistraction(token, roomId, currentDomain, duration)
    }
  }

  currentDomain = newDomain
  tabStartTime = now
}


async function reportDistraction(token, roomId, site, duration) {
  try {
    const res = await fetch(`${API}/rooms/distractions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        room_id: roomId,
        site: site,
        duration_seconds: duration,
      }),
    })
    console.log('[FocusRooms] distraction reported — status:', res.status)
    if (res.ok) {
      const { distractionCount } = await chrome.storage.local.get('distractionCount')
      chrome.storage.local.set({
        distractionCount: (distractionCount ?? 0) + 1,
        lastSite: site,
      })
    }
  } catch (e) {
    console.log('[FocusRooms] could not report distraction:', e)
  }
}


chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('[FocusRooms] tab activated', activeInfo.tabId)
  const tab = await chrome.tabs.get(activeInfo.tabId)
  console.log('[FocusRooms] tab url', tab.url)
  handleTabSwitch(tab.url)
})


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    console.log('[FocusRooms] tab updated', tab.url)
    handleTabSwitch(tab.url)
  }
})