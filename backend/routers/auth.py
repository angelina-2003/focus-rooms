import httpx
import os
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from database import AsyncSessionLocal
from models import User
from jose import jwt
from datetime import datetime, timedelta

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
FRONTEND_URL = "https://focusonit.online"

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
REDIRECT_URI = "https://focus-rooms.onrender.com/auth/google/callback"



def create_jwt(user_id: str, display_name: str) -> str:
    payload = {
        "sub": user_id,
        "display_name": display_name,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@router.get("/google")
async def google_login():
    params = (
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=openid email profile"
    )
    return RedirectResponse(GOOGLE_AUTH_URL + params)


@router.get("/google/callback")
async def google_callback(code: str):
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        token_data = token_response.json()
        access_token = token_data["access_token"]

        # Get user info from Google
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        userinfo = userinfo_response.json()

    google_id = userinfo["id"]
    email = userinfo["email"]
    display_name = userinfo["name"]
    picture = userinfo.get("picture")

    # Find or create user in our DB
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.google_id == google_id))
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                google_id=google_id,
                email=email,
                display_name=display_name,
                picture=picture,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    # Create JWT and redirect to frontend
    token = create_jwt(str(user.id), user.display_name)
    return RedirectResponse(f"{FRONTEND_URL}?token={token}")