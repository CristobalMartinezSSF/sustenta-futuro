"""Entry point for the Sustenta Futuro FastAPI application."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import landing, leads

app = FastAPI(
    title="Sustenta Futuro API",
    description="Backend API for the Sustenta Futuro lead management system.",
    version="0.1.0",
)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://cristobalmartinezssf.github.io",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(leads.router)
app.include_router(landing.router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Return a simple liveness signal."""
    return {"status": "ok"}
