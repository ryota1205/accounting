"""認証コア：パスワードハッシュ（pbkdf2）と HMAC 署名トークン（標準ライブラリのみ）。

- パスワードは pbkdf2_hmac(sha256) でハッシュ化し、ユーザーごとのソルトを持つ。
- トークンは `base64url(payload).base64url(signature)` のステートレス形式。
  payload = {"u": username, "r": role, "exp": epoch秒}、署名は HMAC-SHA256。
- 署名鍵は env `ACCOUNTING_SECRET` を優先。無ければ backend/.secret を生成・再利用。
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import User

PBKDF2_ITERATIONS = 100_000
_SECRET_FILE = Path(__file__).resolve().parent.parent / ".secret"


# ===== パスワード =====
def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """(password_hash_hex, salt_hex) を返す。salt 未指定なら新規生成。"""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return dk.hex(), salt


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    calc, _ = hash_password(password, salt)
    return hmac.compare_digest(calc, expected_hash)


# ===== 署名鍵 =====
def _secret() -> bytes:
    env = os.getenv("ACCOUNTING_SECRET")
    if env:
        return env.encode("utf-8")
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text(encoding="utf-8").strip().encode("utf-8")
    s = secrets.token_hex(32)
    _SECRET_FILE.write_text(s, encoding="utf-8")
    return s.encode("utf-8")


# ===== トークン =====
def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    return _b64e(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())


def make_token(username: str, role: str, days: int = 7) -> str:
    payload = {"u": username, "r": role, "exp": int(time.time()) + days * 86400}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def parse_token(token: str) -> Optional[dict]:
    """署名・期限を検証して payload を返す。不正・期限切れは None。"""
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(body)):
        return None
    try:
        payload = json.loads(_b64d(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


# ===== FastAPI 依存 =====
def get_current_user(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")
    payload = parse_token(authorization[len("Bearer "):])
    if payload is None:
        raise HTTPException(status_code=401, detail="トークンが無効または期限切れです")
    user = session.exec(select(User).where(User.username == payload.get("u"))).first()
    if user is None:
        raise HTTPException(status_code=401, detail="ユーザーが存在しません")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return user
