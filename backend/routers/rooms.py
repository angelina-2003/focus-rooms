from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from database import get_db
from models import Room
from pydantic import BaseModel, Field
import random
import string

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
        "invite_code": room.invite_code,
    }