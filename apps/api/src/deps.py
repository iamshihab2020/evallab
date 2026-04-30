from fastapi import Header, HTTPException, status

from src.config import settings


async def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not settings.EVALLAB_API_KEY:
        return
    if x_api_key != settings.EVALLAB_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )
