"""Vercel Python Serverless Function — wraps the FastAPI app.

Vercel auto-discovers this file and routes /api/* requests to it.
The FastAPI app from backend/server.py handles all API logic.
"""
import sys
import os

# Add backend directory to Python path so all imports work
_backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Import the FastAPI ASGI app — Vercel's Python runtime detects the `app` variable
from server import app  # noqa: E402
