---
title: "Quickstart"
description: "Build the server from a clone, run it against a Postgres database with the daily table, call oura_trend once with curl, then connect an MCP client."
order: 1
section: "Get started"
---

You build the server from a clone, start it against your database, and call `oura_trend` once over HTTP. Then you point an MCP client at it.

## Before you start

- **Node.js and npm.** CI and the container image use Node 24 ([ci.yml](../../.github/workflows/ci.yml), [Dockerfile](../../Dockerfile)). `package.json` declares no `engines` range.
- **Bun.** `npm run build` bundles the server with `bun build`, and `npm run dev` runs it with `bun --watch` ([package.json](../../package.json)). CI installs Bun for the same reason. The README's run steps leave it out.
- **Postgres with a `daily` table**: one row per day, with a `day` column and a column for each of the [eight metrics](reference.md#metrics). [oura-platform](https://github.com/Egoushka/oura-platform) produces it; [The daily table](reference.md#the-daily-table) shows the query the server runs.
- **git**, to clone the repository.

## Build

```bash title="Clone and build"
git clone https://github.com/Egoushka/oura-mcp-app.git
cd oura-mcp-app
npm ci
npm run build
```

`npm run build` runs `tsc --noEmit`, then bundles the app into `dist/mcp-app.html` with Vite, then bundles `server.ts`, `main.ts` and `db.ts` into `dist/` with Bun. Each step runs only if the one before it passed.

## Run

```bash title="Start the server"
DATABASE_URL="postgres://<user>:<password>@<host>:5432/<database>" npm start
```

`npm start` runs `node dist/main.js`, which prints two lines:

```text title="Startup output"
Warning: Server is binding to 0.0.0.0 without DNS rebinding protection. Consider using the allowedHosts option to restrict allowed hosts, or use authentication to protect your server.
Oura MCP App listening on http://0.0.0.0:5010/mcp
```

The warning comes from the MCP SDK, because `HOST` defaults to `0.0.0.0`. The port is `PORT`, default 5010. Nothing connects to the database until the first tool call, so a wrong `DATABASE_URL` first shows up as an error from that call.

> [!IMPORTANT]
> The server has no authentication and returns health data. On `main` it listens on every interface whatever `HOST` says, and it grants every origin CORS access with `Access-Control-Allow-Origin: *`. The README's advice is to keep it on a private network; [Network exposure](reference.md#network-exposure) says what that covers and what it does not.

## Check it

```bash title="Health check"
curl -s http://localhost:5010/healthz
```

```json
{"status":"ok"}
```

`/healthz` answers without querying the database, so its reply covers the process alone. The next call reaches the warehouse.

```bash title="Call oura_trend once"
curl -s http://localhost:5010/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"oura_trend","arguments":{"metric":"sleep_score","days":7}}}'
```

The server keeps no session, so a `tools/call` needs no `initialize` before it. The reply is one server-sent event, `event: message`, whose `data` line holds the JSON-RPC response:

```text title="Reply, shortened"
event: message
data: {"result":{"content":[{"type":"text","text":"Sleep score over <n> day(s), …"}],"structuredContent":{"metric":"sleep_score","label":"Sleep score","unit":"","points":[…]}},"jsonrpc":"2.0","id":1}
```

`content[0].text` is the summary line, and `structuredContent.points` is the series, oldest day first. [The oura_trend tool](reference.md#the-oura_trend-tool) documents both.

## If the call fails

A failed tool call still returns HTTP 200. The result carries `"isError":true` and the reason as text:

| text starts with | cause |
|---|---|
| `Input validation error` | `metric` is not a known key, or `days` is not 2 to 365 |
| `connect ECONNREFUSED` | nothing listens at the host and port in `DATABASE_URL` |

Other database errors arrive the same way, as node-postgres's own message.

A request whose `Accept` header lacks `application/json` or `text/event-stream` gets HTTP 406 and the message `Not Acceptable: Client must accept both application/json and text/event-stream`.

## Connect an MCP client

Point a client that speaks Streamable HTTP at `http://<host>:5010/mcp`. It needs no credentials, because the server asks for none. The client lists one tool, `oura_trend`, titled `Oura trend`. Then ask about one of the [eight metrics](reference.md#metrics), such as your HRV over the last month.

- **Hosts that implement MCP Apps** render the chart when the model calls the tool. The README lists Claude (web and desktop), ChatGPT, VS Code with Copilot Chat 1.109 or later, Goose and Postman, and for Claude Desktop it says to add the server as a remote MCP server. Nothing in this repository tests against a host.
- **Other hosts** show the summary text. A comment in [server.ts](../../server.ts) names Claude Code and LibreChat as hosts that cannot render an MCP App.

## Run it in a container

The Dockerfile copies `dist/` instead of building it, so build first:

```bash title="Build and run the image"
npm ci
npm run build
docker build -t oura-mcp-app .
docker run --rm -p 5010:5010 \
  -e DATABASE_URL="postgres://<user>:<password>@<host>:5432/<database>" \
  oura-mcp-app
```

The [Dockerfile](../../Dockerfile) starts from `node:24-alpine`, installs the production dependencies with `npm ci --omit=dev --ignore-scripts`, copies `dist/`, and runs `node dist/main.js` as the `node` user. [.dockerignore](../../.dockerignore) lets in only `package.json`, `package-lock.json` and `dist/`.

> [!WARNING]
> The image's healthcheck fetches `http://127.0.0.1:5010/healthz` whatever `PORT` says. To serve on another port, change the published port (`-p 8080:5010`) and leave `PORT` alone; with another `PORT`, the container reports itself unhealthy.

Next: [how a chart reaches the host](architecture.md), or the [reference](reference.md).
