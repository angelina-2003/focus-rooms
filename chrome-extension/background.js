console.log('[FocusRooms] background service worker started')

const API = 'http://localhost:8000'

let tabStartTime = null
let currentDomain = null
let whitelistedSites = []
let lastWhitelistFetch = 0

// Restore persisted whitelist immediately on service worker startup so it's
// available before the first tab switch (avoids the async-fetch race).
chrome.storage.local.get('whitelistedSites', ({ whitelistedSites: stored }) => {
  if (Array.isArray(stored)) whitelistedSites = stored
})


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
  if (whitelistedSites.includes(domain)) return true
  return false
}


async function fetchWhitelist(token) {
  lastWhitelistFetch = Date.now()
  try {
    const res = await fetch(`${API}/users/me/whitelist`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      whitelistedSites = data.sites ?? []
      // Persist so the next service worker restart picks it up immediately
      chrome.storage.local.set({ whitelistedSites })
      console.log('[FocusRooms] whitelist loaded:', whitelistedSites)
    }
  } catch {
    // Non-fatal — keep the last known list
  }
}


// Capture JWT from OAuth callback
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const url = tab.url ?? ''
  const match = url.match(/localhost:5173[^?]*\?.*[?&]token=([^&]+)/)
  if (match) {
    const token = decodeURIComponent(match[1])
    chrome.storage.local.set({ authToken: token })
    console.log('[FocusRooms] auth token captured from tab')
    fetchWhitelist(token)
  }
})


async function handleTabSwitch(newUrl) {
  const { token, roomId, authToken } = await chrome.storage.local.get(['token', 'roomId', 'authToken'])

  if (!token || !roomId) {
    lastWhitelistFetch = 0
    currentDomain = null
    tabStartTime = null
    return
  }

  // Await the fetch so shouldIgnore() always uses an up-to-date list
  if (Date.now() - lastWhitelistFetch > 300_000) {
    await fetchWhitelist(authToken || token)
  }

  const newDomain = getDomain(newUrl)
  const now = Date.now()

  if (currentDomain && tabStartTime && !shouldIgnore(currentDomain)) {
    const duration = Math.round((now - tabStartTime) / 1000)
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
  const tab = await chrome.tabs.get(activeInfo.tabId)
  handleTabSwitch(tab.url)
})


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    handleTabSwitch(tab.url)
  }
})

let chromeFocusLostAt = null

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const { token, roomId } = await chrome.storage.local.get(['token', 'roomId'])
  if (!token || !roomId) return

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    chromeFocusLostAt = Date.now()
  } else {
    if (chromeFocusLostAt !== null) {
      const duration = Math.round((Date.now() - chromeFocusLostAt) / 1000)
      chromeFocusLostAt = null
      tabStartTime = Date.now()
      if (duration > 3) {
        reportDistraction(token, roomId, 'another app', duration)
      }
    }
  }
})