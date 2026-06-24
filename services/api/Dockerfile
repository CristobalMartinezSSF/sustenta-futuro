# Sustenta Futuro API — Docker image with headless Chromium for PDF rendering.
#
# The proposal PDF is produced by printing an HTML template with Chromium
# (Playwright). Render's native Python runtime cannot install the browser's
# system libraries, so the API ships as a Docker image instead.
#
# Build context: services/api  (set Render "Root Directory" to services/api and
# "Dockerfile Path" to ./Dockerfile).

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install Python deps, then the Chromium browser + its OS libraries.
# `--with-deps` runs apt-get for the shared libraries Chromium needs.
COPY requirements.txt .
RUN pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium

# Application code.
COPY . .

# Render injects $PORT; default to 8000 for local runs.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
