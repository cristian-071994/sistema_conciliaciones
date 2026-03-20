from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import ALGORITHM, create_access_token, create_password_reset_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import AuthMessage, ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, Token
from app.schemas.user import UserOut
from app.services.notifications import send_manual_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _validate_new_password(new_password: str, confirm_password: str) -> None:
    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="La confirmacion de password no coincide")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva password debe tener al menos 8 caracteres")


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if not user or not user.activo or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o password invalidos")
    token = create_access_token(subject=str(user.id), token_version=int(user.token_version or 0))
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: Usuario = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=AuthMessage)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La password actual es incorrecta")

    _validate_new_password(payload.new_password, payload.confirm_password)
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva password no puede ser igual a la actual")

    user.password_hash = get_password_hash(payload.new_password)
    user.token_version = int(user.token_version or 0) + 1
    db.commit()
    return AuthMessage(message="Password actualizada correctamente. Inicia sesion de nuevo.")


@router.post("/forgot-password", response_model=AuthMessage)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if not user or not user.activo:
        raise HTTPException(status_code=404, detail="No existe un usuario activo con ese correo")

    token = create_password_reset_token(subject=str(user.id), token_version=int(user.token_version or 0))
    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
    email_body = (
        f"Hola {user.nombre},\n\n"
        "Recibimos una solicitud para restablecer tu password en Sistema de Conciliacion.\n"
        f"Este enlace es valido por {settings.password_reset_token_expire_minutes} minutos:\n\n"
        f"{reset_link}\n\n"
        "Si no solicitaste este cambio, puedes ignorar este mensaje.\n"
    )

    send_result = send_manual_email(
        [user.email],
        subject="Recuperacion de password - Sistema de Conciliacion",
        body=email_body,
    )
    if int(send_result.get("sent", 0)) < 1:
        raise HTTPException(status_code=502, detail="No fue posible enviar el correo de recuperacion")

    return AuthMessage(
        message=(
            "Correo de recuperacion enviado correctamente. "
            f"El enlace es valido por {settings.password_reset_token_expire_minutes} minutos."
        )
    )


@router.post("/reset-password", response_model=AuthMessage)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    _validate_new_password(payload.new_password, payload.confirm_password)

    try:
        token_payload = jwt.decode(payload.token, settings.secret_key, algorithms=[ALGORITHM])
        token_type = str(token_payload.get("typ") or "")
        user_id = int(token_payload.get("sub"))
        token_version = int(token_payload.get("ver", 0))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Token invalido o expirado")

    if token_type != "reset_password":
        raise HTTPException(status_code=400, detail="Token invalido o expirado")

    user = db.get(Usuario, user_id)
    if not user or not user.activo:
        raise HTTPException(status_code=400, detail="Token invalido o expirado")

    if int(user.token_version or 0) != token_version:
        raise HTTPException(status_code=400, detail="Token invalido o expirado")

    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva password no puede ser igual a la actual")

    user.password_hash = get_password_hash(payload.new_password)
    user.token_version = int(user.token_version or 0) + 1
    db.commit()
    return AuthMessage(message="Password restablecida correctamente. Ya puedes iniciar sesion.")
