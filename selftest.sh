#!/bin/sh
# Self-check for the HTTP guards: npm run build && npm test.
# Starts the built server twice and asserts that the default bind is loopback only, that a Host
# header outside the allow-list (DNS rebinding) is refused, and that no origin gets a CORS grant.
# Needs no database: initialize never queries it.
set -eu
cd "$(dirname "$0")"

pids=
trap 'kill $pids 2>/dev/null || true' EXIT

expect() { # expect <want> <what> <got>
  [ "$3" = "$1" ] || { echo "FAIL: $2 (wanted $1, got $3)"; exit 1; }
  echo "ok: $2"
}

start() { # start <port> [VAR=value...]
  port=$1
  shift
  env PORT="$port" DATABASE_URL=postgres://selftest@127.0.0.1:1/none "$@" node dist/main.js >/dev/null 2>&1 &
  pids="$pids $!"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    curl -fs "http://127.0.0.1:$port/healthz" >/dev/null && return
    sleep 0.25
  done
  echo "FAIL: server on $port did not start"
  exit 1
}

init() { # init <port> <Host header>: HTTP status of an MCP initialize
  curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$1/mcp" -H "Host: $2" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"selftest","version":"0"}}}'
}

start 5991
expect 200 "default: loopback Host passes" "$(init 5991 127.0.0.1:5991)"
expect 403 "default: foreign Host refused" "$(init 5991 rebind.example:5991)"
lan=$(node -p 'Object.values(os.networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address ?? ""')
if [ -n "$lan" ]; then
  expect 000 "default: not listening on $lan" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://$lan:5991/healthz" || true)"
fi

start 5992 HOST=0.0.0.0 ALLOWED_HOSTS=oura.internal
expect 200 "ALLOWED_HOSTS entry passes" "$(init 5992 oura.internal:5992)"
expect 200 "loopback still passes, for the healthcheck" "$(init 5992 127.0.0.1:5992)"
expect 403 "foreign Host refused" "$(init 5992 rebind.example:5992)"
grants=$(curl -s -D - -o /dev/null -X OPTIONS http://127.0.0.1:5992/mcp -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' |
  grep -ci '^access-control-allow-origin' || true)
expect 0 "no CORS grant to another origin" "$grants"
