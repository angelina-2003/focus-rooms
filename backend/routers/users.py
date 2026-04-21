from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from database import get_db
from models import User

router = APIRouter()

class CreateUserRequest(BaseModel):
    display_name: str

class UserResponse(BaseModel):
    id: str
    display_name: str

    class Config:
        from_attributes = True

@router.post("/")
async def create_user(body: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    user = User(display_name=body.display_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "display_name": user.display_name}