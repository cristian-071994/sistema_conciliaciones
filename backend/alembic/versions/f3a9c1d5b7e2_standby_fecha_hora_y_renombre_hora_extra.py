"""stand by: fecha/hora inicial y final, y renombre de Hora Extra a Stand By

Revision ID: f3a9c1d5b7e2
Revises: 70008444456b
Create Date: 2026-11-23 00:00:00.000000

El servicio "Hora Extra" pasa a llamarse "Stand By" y deja de ir hasta una
hora fija (06:00): ahora se mide entre una fecha+hora inicial y una fecha+hora
final, y puede abarcar varios días.

1. Agrega viajes.fecha_hora_inicio / fecha_hora_fin (nullable; nada existente
   se modifica ni se borra — hora_inicio, hora_fin y horas_cantidad siguen).
2. Renombra la fila existente del catálogo (servicios) a "Stand By" /
   STAND_BY CONSERVANDO su id: así las tarifas del Catálogo de Tarifas y los
   viajes históricos siguen enlazados sin tocarlos. Solo se renombra si no
   existe ya un servicio Stand By (idempotente y a prueba de choque con las
   restricciones UNIQUE de nombre/código).
3. Rellena el rango de los viajes históricos de Hora Extra a partir de lo que
   ya tenían (fecha_servicio + hora_inicio, y esa fecha-hora + horas_cantidad),
   solo en las columnas nuevas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a9c1d5b7e2"
down_revision: Union[str, None] = "70008444456b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("viajes", sa.Column("fecha_hora_inicio", sa.DateTime(), nullable=True))
    op.add_column("viajes", sa.Column("fecha_hora_fin", sa.DateTime(), nullable=True))

    # Producción ya tenía un servicio "Stand By" aparte (intento anterior, con
    # tarifas inactivas). Se retira SIN borrar ni mover nada (sus viajes siguen
    # enlazados como histórico) para liberar el nombre/código, y solo si existe
    # "Hora Extra" que lo reemplace.
    op.execute(
        """
        UPDATE servicios
        SET codigo = 'STAND_BY_ANTERIOR', nombre = 'Stand By (anterior)', activo = false
        WHERE codigo = 'STAND_BY'
          AND EXISTS (SELECT 1 FROM servicios WHERE codigo = 'HORA_EXTRA')
          AND NOT EXISTS (SELECT 1 FROM servicios WHERE codigo = 'STAND_BY_ANTERIOR')
        """
    )
    op.execute(
        """
        UPDATE servicios
        SET codigo = 'STAND_BY', nombre = 'Stand By'
        WHERE codigo = 'HORA_EXTRA'
          AND NOT EXISTS (
              SELECT 1 FROM servicios WHERE codigo = 'STAND_BY' OR upper(nombre) = 'STAND BY'
          )
        """
    )

    op.execute(
        """
        UPDATE viajes
        SET fecha_hora_inicio = fecha_servicio + hora_inicio,
            fecha_hora_fin = (fecha_servicio + hora_inicio) + (horas_cantidad * interval '1 hour')
        WHERE hora_inicio IS NOT NULL
          AND horas_cantidad IS NOT NULL
          AND servicio_id IN (SELECT id FROM servicios WHERE codigo = 'STAND_BY')
        """
    )


def downgrade() -> None:
    # Las columnas nuevas se descartan (los Stand By de varios días perderían su
    # rango; hora_inicio/hora_fin/horas_cantidad se conservan).
    op.execute(
        """
        UPDATE servicios
        SET codigo = 'HORA_EXTRA', nombre = 'Hora Extra'
        WHERE codigo = 'STAND_BY'
          AND EXISTS (SELECT 1 FROM servicios WHERE codigo = 'STAND_BY_ANTERIOR')
        """
    )
    op.execute(
        """
        UPDATE servicios
        SET codigo = 'STAND_BY', nombre = 'Stand By', activo = true
        WHERE codigo = 'STAND_BY_ANTERIOR'
        """
    )
    # Caso sin "Stand By (anterior)": el Stand By actual es el ex "Hora Extra".
    op.execute(
        """
        UPDATE servicios
        SET codigo = 'HORA_EXTRA', nombre = 'Hora Extra'
        WHERE codigo = 'STAND_BY'
          AND NOT EXISTS (SELECT 1 FROM servicios WHERE codigo = 'HORA_EXTRA')
        """
    )
    op.drop_column("viajes", "fecha_hora_fin")
    op.drop_column("viajes", "fecha_hora_inicio")
