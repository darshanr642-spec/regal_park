#!/usr/bin/env python3
"""Minimal start script for Render - isolates import errors."""
import sys
import os

print("=== Starting Regal Park API ===", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"PORT: {os.environ.get('PORT', '10000')}", flush=True)
print(f"MONGO_URL set: {'yes' if os.environ.get('MONGO_URL') else 'no'}", flush=True)
print(f"JWT_SECRET len: {len(os.environ.get('JWT_SECRET', ''))}", flush=True)

try:
    print("Importing config...", flush=True)
    import config
    print(f"Config OK: DB={config.DB_NAME}", flush=True)
except Exception as e:
    print(f"CONFIG ERROR: {e}", flush=True)
    sys.exit(1)

try:
    print("Importing server...", flush=True)
    import server
    print("Server module OK", flush=True)
except Exception as e:
    print(f"SERVER IMPORT ERROR: {e}", flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("Starting uvicorn...", flush=True)
import uvicorn
port = int(os.environ.get("PORT", "10000"))
uvicorn.run(server.app, host="0.0.0.0", port=port)
