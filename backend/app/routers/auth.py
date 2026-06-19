import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import User
from app import auth as authmod

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ===== 総当たり対策（ユーザー名ごと・メモリ内） =====
LOCK_THRESHOLD = 5      # 連続失敗の上限
LOCK_SECONDS = 900      # ロック時間（15分）
_fails: dict = {}       # username -> {"count": int, "until": float}


def _check_lock(username: str) -> None:
    rec = _fails.get(username)
    if rec and rec["until"] > time.time():
        wait = int((rec["until"] - time.time()) / 60) + 1
        raise HTTPException(status_code=429,
                            detail=f"ログイン試行が多すぎます。約{wait}分後にお試しください。")


def _record_fail(username: str) -> None:
    rec = _fails.get(username) or {"count": 0, "until": 0.0}
    rec["count"] += 1
    if rec["count"] >= LOCK_THRESHOLD:
        rec["until"] = time.time() + LOCK_SECONDS
        rec["count"] = 0
    _fails[username] = rec


def _clear_fail(username: str) -> None:
    _fails.pop(username, None)


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


def _user_out(u: User) -> dict:
    return {
        "username": u.username, "name": u.name, "role": u.role,
        "must_change_password": not u.password_changed,
    }


@router.post("/login")
def login(data: LoginIn, session: Session = Depends(get_session)):
    _check_lock(data.username)
    user = session.exec(select(User).where(User.username == data.username)).first()
    if user is None or not authmod.verify_password(data.password, user.salt, user.password_hash):
        _record_fail(data.username)
        raise HTTPException(status_code=401, detail="IDまたはパスワードが違います")
    _clear_fail(data.username)
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
    user.password_changed = True
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"ok": True}
