# ── Backend: Python/FastAPI ──────────────────────────────
FROM python:3.11-slim AS backend

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps (cached layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY backend/ .

# Remove dev-only files
RUN rm -rf tests/ __pycache__/ .env .env.* *.pyc generated_pdfs/

# Create non-root user
RUN adduser --disabled-password --gecos "" appuser && \
    mkdir -p /app/generated_pdfs && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
