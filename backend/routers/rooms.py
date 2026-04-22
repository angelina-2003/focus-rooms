from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from database import get_db
from models import Room, DistractionEvent, Session as FocusSession
from pydantic import BaseModel, Field
from jose import jwt, JWTError
from routers.websocket import manager
import random
import string
import os

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
ALGORITHM = "HS256"

router = APIRouter()


def generate_invite_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    duration_minutes: int = Field(ge=5, le=1440)
    is_private: bool = False
    created_by: str = None


@router.post("/")
async def create_room(body: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    invite_code = generate_invite_code() if body.is_private else None

    room = Room(
        name=body.name,
        is_private=body.is_private,
        invite_code=invite_code,
        created_by=body.created_by,
        scheduled_start=datetime.utcnow(),
        duration_minutes=body.duration_minutes,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)

    response = {
        "id": str(room.id),
        "name": room.name,
        "duration_minutes": room.duration_minutes,
        "is_private": room.is_private,
    }
    if invite_code:
        response["invite_code"] = invite_code

    return response


@router.get("/active")
async def get_active_rooms(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    result = await db.execute(
        select(Room)
        .where(Room.is_private == False)
        .order_by(Room.scheduled_start.desc())
        .limit(20)
    )
    rooms = result.scalars().all()

    active = []
    for room in rooms:
        elapsed = int((now - room.scheduled_start).total_seconds())
        remaining = max(0, room.duration_minutes * 60 - elapsed)
        if remaining > 0:
            active.append({
                "id": str(room.id),
                "name": room.name,
                "elapsed_seconds": elapsed,
                "remaining_seconds": remaining,
            })

    return active


@router.get("/code/{invite_code}")
async def get_room_by_code(invite_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Room).where(Room.invite_code == invite_code.upper())
    )
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    now = datetime.utcnow()
    elapsed = int((now - room.scheduled_start).total_seconds())
    remaining = max(0, room.duration_minutes * 60 - elapsed)

    if remaining == 0:
        raise HTTPException(status_code=410, detail="Room has ended")

    return {
        "id": str(room.id),
        "name": room.name,
        "remaining_seconds": remaining,
        "elapsed_seconds": elapsed,
        "invite_code": room.invite_code,
    }

@router.get("/{room_id}/results")
async def get_room_results(room_id: str, db: AsyncSession = Depends(get_db)):
    room_result = await db.execute(select(Room).where(Room.id == room_id))
    room = room_result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    sessions_result = await db.execute(
        select(FocusSession)
        .where(FocusSession.room_id == room_id)
        .options(
            selectinload(FocusSession.user),
            selectinload(FocusSession.distraction_events),
        )
    )
    sessions = sessions_result.scalars().all()

    total_duration = room.duration_minutes * 60
    now = datetime.utcnow()

    participants = []
    for s in sessions:
        distracted = sum(e.duration_seconds or 0 for e in s.distraction_events)
        time_in_room = min(total_duration, int((now - s.joined_at).total_seconds()))
        focused = max(0, time_in_room - distracted)
        pct = round(focused / time_in_room * 100) if time_in_room > 0 else 100
        participants.append({
            "display_name": s.user.display_name,
            "focused_seconds": focused,
            "distracted_seconds": distracted,
            "focus_pct": pct,
        })

    participants.sort(key=lambda p: p["focused_seconds"], reverse=True)

    return {
        "room_name": room.name,
        "duration_minutes": room.duration_minutes,
        "participants": participants,
    }


class DistractionRequest(BaseModel):
    room_id: str
    site: str
    duration_seconds: int


@router.post("/distractions")
async def report_distraction(
    body: DistractionRequest,
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # Pull identity from the JWT — same token the web app uses
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload["sub"]
        display_name = payload["display_name"]
    except (JWTError, IndexError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")

    # Find their active session so we can attach the distraction event to it
    result = await db.execute(
        select(FocusSession)
        .where(FocusSession.user_id == user_id)
        .where(FocusSession.room_id == body.room_id)
        .where(FocusSession.completed == False)
        .order_by(FocusSession.joined_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()

    if session:
        event = DistractionEvent(
            session_id=str(session.id),
            site=body.site,
            duration_seconds=body.duration_seconds,
            occurred_at=datetime.utcnow(),
        )
        db.add(event)
        await db.commit()

    # Broadcast to everyone in the room — this is what makes it show up in the feed
    print(f"[DISTRACTION] Broadcasting to room: '{body.room_id}'")          # ADD THIS
    print(f"[DISTRACTION] Active rooms in manager: {list(manager.rooms.keys())}")  # ADD THIS
    # Broadcast to everyone in the room — this is what makes it show up in the feed
    await manager.broadcast(body.room_id, {
        "type": "distraction",
        "display_name": display_name,
        "site": body.site,
        "duration_seconds": body.duration_seconds,
    })

    return {"ok": True}