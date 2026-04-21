from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from database import get_db
from models import Room, Session
from pydantic import BaseModel, Field


router = APIRouter()

class CreateRoomRequest(BaseModel):
    duration_minutes: int = Field(ge=5, le=1440)

@router.post("/")
async def create_room(body: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    room = Room(scheduled_start=datetime.utcnow(), duration_minutes=body.duration_minutes)    
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return {"id": str(room.id), "duration_minutes": room.duration_minutes}


@router.get("/active")
async def get_active_rooms(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    result = await db.execute(select(Room).order_by(Room.scheduled_start.desc()).limit(20))
    rooms = result.scalars().all()

    active = []
    for room in rooms:
        elapsed = int((now - room.scheduled_start).total_seconds())
        remaining = max(0, room.duration_minutes * 60 - elapsed)
        if remaining > 0:
            active.append({
                "id": str(room.id),
                "elapsed_seconds": elapsed,
                "remaining_seconds": remaining,
            })

    return active