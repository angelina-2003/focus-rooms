from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, AsyncSessionLocal
from models import User, Room, Session, DistractionEvent
from models import Session as FocusSession
from routers import users, rooms, auth
from routers.websocket import manager
from sqlalchemy import select
from jose import jwt, JWTError
import json
import os
from datetime import datetime

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Focus Rooms API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/")
async def root():
    return {"status": "Focus Rooms API is running"}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: str = Query(...)):
    # Verify JWT
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload["sub"]
        display_name = payload["display_name"]
    except JWTError:
        await websocket.close(code=4001)
        return

    # Create a focus session in the DB
    async with AsyncSessionLocal() as db:
        focus_session = FocusSession(user_id=user_id, room_id=room_id)
        db.add(focus_session)
        await db.commit()
        await db.refresh(focus_session)
        session_id = str(focus_session.id)

    is_new_join = await manager.connect(websocket, room_id, user_id, display_name)

    if is_new_join:
        await manager.broadcast(room_id, {
            "type": "user_joined",
            "display_name": display_name,
            "participants": manager.get_participants(room_id),
        })

    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received: {data}")
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