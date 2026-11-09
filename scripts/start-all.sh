#!/bin/sh
# START-ALL.SH — Runs the frontend and backend in a single image.
#
# Runs the backend on port 3001 and the frontend on port 3000.
# Uses `wait -n` to exit when any process terminates — correct container
# behavior, since a container has no purpose if one of its services is down.

set -e

# Backend first because it is a dependency of the frontend.
node /app/backend/dist/main.js &
BACKEND_PID=$!

# Frontend.
next start &
FRONTEND_PID=$!

# Wait for any process to terminate.
wait -n $BACKEND_PID $FRONTEND_PID
STATUS=$?

# If one process ends, kill the other too.
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true

exit $STATUS
