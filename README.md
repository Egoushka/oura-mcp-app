# Oura MCP App

An [MCP App](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) that charts Oura Ring trends from a self-hosted warehouse. The tool returns the daily series *and* an interactive chart: hosts that implement MCP Apps render the chart inline; hosts that don't still get a useful text summary from the same call.

Rendered today by Claude (web and desktop), ChatGPT, VS Code / Copilot Chat 1.109+, Goose and Postman.

## What it does

One tool, `oura_trend(metric, days)`, over the `daily` table:

`sleep_score`, `readiness_score`, `activity_score`, `hrv_avg`, `rhr_lowest`, `temp_deviation`, `spo2_avg`, `steps`.

The chart lets you switch metric and range (7/30/90 days) without another model turn — the app calls the tool directly over the host bridge.

## How it is put together

| File | Role |
|---|---|
| `server.ts` | `registerAppTool` with `_meta.ui.resourceUri`, plus `registerAppResource` serving the UI |
| `db.ts` | Read-only Postgres access. Column names come from a fixed map, never from tool input |
| `main.ts` | Streamable HTTP transport, stateless (one server per request) |
| `mcp-app.html` + `src/` | The UI, bundled by Vite into a single inlined HTML file |

The host fetches exactly one HTML resource, so `vite-plugin-singlefile` inlines the script and CSS into it. The app reads the host's theme and style variables, so it matches whichever client renders it.

## Run

```bash
npm install
npm run build
DATABASE_URL="postgres://user:pass@host:5432/oura" npm start
```

Serves `POST /mcp` (Streamable HTTP) on `PORT`, default 5010, plus `/healthz`. Listens on `HOST`, default `127.0.0.1`; the Docker image sets `0.0.0.0`.

## Connect it

Point an MCP client at `http://<host>:5010/mcp`. It has no authentication and serves health data: keep it on a private network.

Requests whose `Host` header is not loopback get a 403 unless the name is in `ALLOWED_HOSTS` (comma-separated, no ports), e.g. `ALLOWED_HOSTS=oura.internal`. That is the DNS-rebinding guard, so list only names and addresses you control. The server sends no CORS headers: an MCP App's UI talks to its host over `postMessage`, not to this server, so no web page needs to read a response.

For Claude Desktop, add it as a remote MCP server; the app appears when the tool is called.

## Layout note

`daily` is the schema this reads: one row per day with the score and biometric columns listed above. It is produced by [oura-platform](https://github.com/Egoushka/oura-platform), not by this repo.

## Contributing

Before committing, enable the hooks: `git config core.hooksPath .githooks`, then copy
`.private-terms.example` to `.private-terms` and list what must never appear here.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Not affiliated with or endorsed by Oura; "Oura" is a trademark of its owner. This is a personal
data tool, not a medical device, and nothing it shows is medical advice.
