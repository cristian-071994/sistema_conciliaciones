from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {"sub": subject, "exp": expire, "typ": "access", "ver": int(token_version)}
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_password_reset_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expire_minutes)
    to_encode = {
        "sub": subject,
        "exp": expire,
        "typ": "reset_password",
        "ver": int(token_version),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)
