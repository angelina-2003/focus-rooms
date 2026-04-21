import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

const API = 'http://localhost:8000'

function Room() {
  const { roomId } = useParams()
  const [participants, setParticipants] = useState([])
  const [feed, setFeed] = useState([])
  const [timeLeft, setTimeLeft] = useState(null)
  const ws = useRef(null)

  const userId = sessionStorage.getItem('userId')
  const displayName = sessionStorage.getItem('displayName')

  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:8000/ws/${roomId}/${userId}`)

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.type === 'user_joined' || message.type === 'user_left') {
        setParticipants(message.participants)
        setFeed(prev => [...prev, `${message.display_name} ${message.type === 'user_joined' ? 'joined' : 'left'}`])
      }

      if (message.type === 'distraction') {
        setFeed(prev => [...prev, `${message.display_name} got distracted by ${message.site}`])
      }
    }

    let hiddenAt = null

    const handleVisibilityChange = () => {
      console.log('visibility changed:', document.visibilityState)
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
        const duration = Math.round((Date.now() - hiddenAt) / 1000)
        hiddenAt = null
        console.log('sending distraction, duration:', duration)
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
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
      ws.current.close()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [roomId, userId])

  return (
    <div>
      <h1>Focus Room</h1>
      <h2>In the room:</h2>
      <ul>
        {participants.map(p => (
          <li key={p.user_id}>{p.display_name}</li>
        ))}
      </ul>
      <h2>Feed:</h2>
      <ul>
        {feed.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default Room