FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Expose port (Render uses $PORT, default 10000)
EXPOSE 10000

# Start server from backend directory (flat imports)
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}
