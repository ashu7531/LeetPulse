#!/bin/bash
# Start a dummy HTTP server on the Render-provided $PORT in the background
# This satisfies Render's 10-minute "Web Service" health check and keeps the server alive
python -m http.server $PORT &

# Start the Celery worker and the Beat scheduler (-B) in the foreground
celery -A app.celery worker -B --loglevel=info
