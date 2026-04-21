import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from database import AsyncSessionLocal
from models import Session as FocusSession, User, DistractionEvent
from sqlalchemy import select
from datetime import datetime

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[dict]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, display_name: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append({
            "websocket": websocket,
            "user_id": user_id,
            "display_name": display_name,
        })

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id] = [
                c for c in self.rooms[room_id] if c["websocket"] != websocket
            ]

    def get_participants(self, room_id: str) -> list[dict]:
        return [
            {"user_id": c["user_id"], "display_name": c["display_name"]}
            for c in self.rooms.get(room_id, [])
        ]

    async def broadcast(self, room_id: str, message: dict):
        for connection in self.rooms.get(room_id, []):
            await connection["websocket"].send_text(json.dumps(message))

manager = ConnectionManager()

@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    print(f"WebSocket connection attempt: room={room_id} user={user_id}")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001)
            return
        display_name = user.display_name

        focus_session = FocusSession(user_id=user_id, room_id=room_id)
        db.add(focus_session)
        await db.commit()
        await db.refresh(focus_session)
        session_id = str(focus_session.id)

    await manager.connect(websocket, room_id, user_id, display_name)
    await manager.broadcast(room_id, {
        "type": "user_joined",
        "display_name": display_name,
        "participants": manager.get_participants(room_id),
    })

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "distraction":
                site = message.get("site", "tab_switch")
                duration = message.get("duration_seconds")

                async with AsyncSessionLocal() as db:
                    event = DistractionEvent(
                        session_id=session_id,
                        site=site,
                        duration_seconds=duration,
                        occurred_at=datetime.utcnow(),
                    )
                    db.add(event)
                    await db.commit()

                await manager.broadcast(room_id, {
                    "type": "distraction",
                    "display_name": display_name,
                    "site": site,
                    "duration_seconds": duration,
                })

            elif message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        await manager.broadcast(room_id, {
            "type": "user_left",
            "display_name": display_name,
            "participants": manager.get_participants(room_id),
        })