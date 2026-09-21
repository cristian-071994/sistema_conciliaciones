import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import (
    AuthMessage,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    Token,
)
from app.schemas.user import UserOut
from app.services.notifications import send_manual_email
from app.services.permisos_service import permisos_de_usuario
from app.services.rate_limit import ensure_not_rate_limited, register_failed_attempt, reset_attempts

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _validate_new_password(new_password: str, confirm_password: str) -> None:
    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="La confirmacion de password no coincide")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva password debe tener al menos 8 caracteres")


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Clave por IP + email: no bloquea a todo el mundo por los intentos de
    # uno solo, pero sí frena fuerza bruta contra una cuenta puntual.
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"{client_host}:{payload.email.strip().lower()}"
    ensure_not_rate_limited(rate_key)

    user = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if not user or not user.activo or not verify_password(payload.password, user.password_hash):
        register_failed_attempt(rate_key)
        raise HTTPException(status_code=401, detail="Email o password invalidos")

    reset_attempts(rate_key)
    version = int(user.token_version or 0)
    token = create_access_token(subject=str(user.id), token_version=version)
    refresh_token = create_refresh_token(subject=str(user.id), token_version=version)
    return Token(access_token=token, refresh_token=refresh_token)


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    # Mismo patrón de validación que /auth/reset-password: decodifica, exige
    # typ="refresh" y compara token_version contra el usuario — así un cambio
    # de password invalida los refresh tokens ya emitidos igual que los access.
    credentials_exception = HTTPException(status_code=401, detail="Refresh token invalido o expirado")
    try:
        token_payload = jwt.decode(payload.refresh_token, settings.secret_key, algorithms=[ALGORITHM])
        token_type = str(token_payload.get("typ") or "")
        user_id = int(token_payload.get("sub"))
        token_version = int(token_payload.get("ver", 0))
    except (JWTError, ValueError, TypeError):
        raise credentials_exception

    if token_type != "refresh":
        raise credentials_exception

    user = db.get(Usuario, user_id)
    if not user or not user.activo:
        raise credentials_exception
    if int(user.token_version or 0) != token_version:
        raise credentials_exception

    new_access_token = create_access_token(subject=str(user.id), token_version=int(user.token_version or 0))
    return RefreshResponse(access_token=new_access_token)


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    out = UserOut.model_validate(user)
    return out.model_copy(update={"permisos": permisos_de_usuario(db, user)})


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
    # Mensaje SIEMPRE idéntico exista o no la cuenta (y solo se envía correo
    # si existe) — evita que este endpoint sirva para enumerar qué correos
    # están registrados en el sistema (dato personal bajo Ley 1581).
    generic_message = AuthMessage(
        message=(
            "Si el correo está registrado, te enviamos un enlace de recuperación. "
            f"Es válido por {settings.password_reset_token_expire_minutes} minutos."
        )
    )

    user = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if not user or not user.activo:
        return generic_message

    token = create_password_reset_token(subject=str(user.id), token_version=int(user.token_version or 0))
    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
    email_body = (
        f"Hola {user.nombre},\n\n"
        "Recibimos una solicitud para restablecer tu password en Refrigerados.\n"
        f"Este enlace es valido por {settings.password_reset_token_expire_minutes} minutos:\n\n"
        f"{reset_link}\n\n"
        "Si no solicitaste este cambio, puedes ignorar este mensaje.\n"
    )

    send_result = send_manual_email(
        [user.email],
        subject="Recuperacion de password - Refrigerados",
        body=email_body,
    )
    # No se distingue el resultado del envío en la respuesta (ver arriba);
    # un fallo de SMTP se monitorea por logs, nunca por la API.
    if send_result["failed"]:
        logger.warning(
            "No se pudo enviar el correo de recuperacion de password a usuario_id=%s: %s",
            user.id,
            "; ".join(send_result["errors"]) or "error desconocido",
        )
    return generic_message


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
