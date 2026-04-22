from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import List
from database import get_db
from models import User
from jose import jwt, JWTError
from uuid import UUID
import os

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
ALGORITHM = "HS256"


def decode_token(authorization: str) -> str:
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except (JWTError, IndexError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")


class WhitelistRequest(BaseModel):
    sites: List[str]


@router.get("/me/whitelist")
async def get_whitelist(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    user_id = decode_token(authorization)
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"sites": user.whitelisted_sites or []}


@router.put("/me/whitelist")
async def update_whitelist(
    body: WhitelistRequest,
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    user_id = decode_token(authorization)
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Normalise: lowercase, strip www., strip protocols
    cleaned = []
    for s in body.sites:
        s = s.strip().lower()
        s = s.removeprefix("https://").removeprefix("http://")
        s = s.removeprefix("www.")
        s = s.split("/")[0]  # drop any path
        if s:
            cleaned.append(s)
    user.whitelisted_sites = list(dict.fromkeys(cleaned))  # dedupe, preserve order
    flag_modified(user, "whitelisted_sites")
    await db.commit()
    return {"sites": user.whitelisted_sites}
