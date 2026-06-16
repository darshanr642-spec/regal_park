#!/bin/bash
echo "=== Regal Park API Starting ==="
echo "Python version: $(python --version)"
echo "PORT: ${PORT:-10000}"
echo "DB_NAME: $DB_NAME"
echo "MONGO_URL set: $([ -n "$MONGO_URL" ] && echo 'yes' || echo 'no')"
echo "JWT_SECRET length: ${#JWT_SECRET}"

# Use PORT env var from Render, default 10000
exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}
