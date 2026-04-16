from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

resolved_database_url = settings.sqlalchemy_database_url
if not resolved_database_url.lower().startswith("postgresql"):
    raise RuntimeError(
        "Configuracion de base de datos invalida: solo se permite PostgreSQL en este proyecto."
    )

engine = create_engine(resolved_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
