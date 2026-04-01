from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

resolved_database_url = settings.sqlalchemy_database_url
connect_args = {"check_same_thread": False} if resolved_database_url.startswith("sqlite") else {}

engine = create_engine(resolved_database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
