from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import User
from app import auth as authmod

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


def _user_out(u: User) -> dict:
    return {"username": u.username, "name": u.name, "role": u.role}


@router.post("/login")
def login(data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    if user is None or not authmod.verify_password(data.password, user.salt, user.password_hash):
        raise HTTPException(status_code=401, detail="IDまたはパスワードが違います")
    token = authmod.make_token(user.username, user.role)
    return {"token": token, "user": _user_out(user)}


@router.get("/me")
def me(user: User = Depends(authmod.get_current_user)):
    return _user_out(user)


@router.post("/change-password")
def change_password(
    data: ChangePasswordIn,
    user: User = Depends(authmod.get_current_user),
    session: Session = Depends(get_session),
):
    if not authmod.verify_password(data.current_password, user.salt, user.password_hash):
        raise HTTPException(status_code=400, detail="現在のパスワードが違います")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="新しいパスワードは6文字以上にしてください")
    user.password_hash, user.salt = authmod.hash_password(data.new_password)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"ok": True}
