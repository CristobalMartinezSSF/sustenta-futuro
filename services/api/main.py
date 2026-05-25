"""Entry point for the Sustenta Futuro FastAPI application."""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers import auth, landing, leads

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Sustenta Futuro API",
    description="Backend API for the Sustenta Futuro lead management system.",
    version="0.1.0",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://cristobalmartinezssf.github.io",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(leads.router)
app.include_router(landing.router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Return a simple liveness signal."""
    return {"status": "ok"}
