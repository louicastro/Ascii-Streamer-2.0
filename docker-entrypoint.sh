#!/bin/sh
set -e

# Set default PORT if not provided
export PORT=${PORT:-3000}

# Health check: ensure required env vars are set
if [ -z "$DATABASE_URL" ]; then
  echo "WARNING: DATABASE_URL not set. Database features will be unavailable."
  echo "Set DATABASE_URL=postgresql://user:pass@host/dbname to enable database."
fi

# Start Node.js API server
echo "Starting API server on port $PORT..."
node --enable-source-maps ./api-server/dist/index.mjs
