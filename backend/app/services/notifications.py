import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario


def _send_email(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[dict[str, object]] | None = None,
    cc_emails: list[str] | None = None,
) -> tuple[bool, str | None]:
    if not settings.smtp_enabled:
        return False, "SMTP deshabilitado"
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password, settings.mail_from]):
        return False, "Configuracion SMTP incompleta"

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.mail_from
        msg["To"] = to_email
        if cc_emails:
            msg["Cc"] = ", ".join(cc_emails)
        msg.set_content(body)
        for attachment in attachments or []:
            filename = str(attachment.get("filename") or "adjunto.bin")
            content = attachment.get("content")
            mime_type = str(attachment.get("mime_type") or "application/octet-stream")
            if not isinstance(content, (bytes, bytearray)):
                continue
            maintype, subtype = mime_type.split("/", 1) if "/" in mime_type else ("application", "octet-stream")
            msg.add_attachment(bytes(content), maintype=maintype, subtype=subtype, filename=filename)

        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        return True, None
    except Exception as exc:
        return False, str(exc)


def create_internal_notifications(
    db: Session,
    recipients: list[Usuario],
    *,
    titulo: str,
    mensaje: str,
    tipo: str = "CONCILIACION",
    conciliacion_id: int | None = None,
) -> None:
    for user in recipients:
        notif = Notificacion(
            usuario_id=user.id,
            titulo=titulo,
            mensaje=mensaje,
            tipo=tipo,
            leida=False,
            email_intentado=False,
            email_enviado=False,
            email_error=None,
            conciliacion_id=conciliacion_id,
        )
        db.add(notif)


def render_email_template(template_key: str, context: dict[str, str]) -> tuple[str, str]:
    if template_key == "CONCILIACION_PENDIENTE_CLIENTE":
        subject = f"Conciliacion pendiente: {context.get('conciliacion_nombre', '')}"
        body = (
            "Hola,\n\n"
            f"Hay una conciliacion pendiente de revision: {context.get('conciliacion_nombre', '')}.\n"
            f"Operacion: {context.get('operacion_nombre', '')}\n"
            f"Periodo: {context.get('periodo', '')}\n\n"
            "Por favor ingresa al sistema para revisar y aprobar/rechazar los items.\n\n"
            "Saludos,\nCointra S.A.S."
        )
        return subject, body

    if template_key == "RESPUESTA_CLIENTE_COINTRA":
        subject = f"Cliente respondio conciliacion: {context.get('conciliacion_nombre', '')}"
        body = (
            "Hola,\n\n"
            f"El cliente ya respondio la conciliacion {context.get('conciliacion_nombre', '')}.\n"
            f"Estado actual: {context.get('estado', '')}\n\n"
            "Ingresa al sistema para revisar los resultados.\n\n"
            "Saludos,\nCointra S.A.S."
        )
        return subject, body

    return "Notificacion Sistema Conciliacion", context.get("mensaje", "")


def send_manual_email(
    to_emails: list[str],
    *,
    subject: str,
    body: str,
    attachments: list[dict[str, object]] | None = None,
    cc_emails: list[str] | None = None,
) -> dict:
    # Enviar un solo correo con todos los destinatarios principales y CC
    if not to_emails:
        return {"sent": 0, "failed": 1, "errors": ["No hay destinatarios principales"]}
    try:
        ok, err = _send_email(
            ", ".join(to_emails),
            subject,
            body,
            attachments=attachments,
            cc_emails=cc_emails,
        )
        if ok:
            return {"sent": 1, "failed": 0, "errors": []}
        else:
            return {"sent": 0, "failed": 1, "errors": [err or "Error desconocido"]}
    except Exception as exc:
        return {"sent": 0, "failed": 1, "errors": [str(exc)]}
