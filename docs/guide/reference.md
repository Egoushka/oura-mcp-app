---
title: "Reference"
description: "The oura_trend tool, the eight metrics, the UI resource and app, the HTTP endpoints, environment variables, the daily table, scripts, the image and the hooks."
order: 3
section: "Reference"
---

## The oura_trend tool

[server.ts](../../server.ts) registers it with `registerAppTool`, under the title `Oura trend` and this description:

```text title="Tool description"
Chart one Oura Ring metric over recent days from the self-hosted warehouse. Returns the daily series plus a short text summary.
```

Its `_meta` points at the [UI resource](#the-ui-resource) twice, as `ui.resourceUri` and as the older flat key `ui/resourceUri`, both `ui://oura-trend/mcp-app.html`. The server itself is named `Oura Trends`, version 0.1.0, and offers the `tools` and `resources` capabilities.

### Input

| argument | type | default | allowed values |
|---|---|---|---|
| `metric` | string | `sleep_score` | one of the eight [metric keys](#metrics) |
| `days` | integer | `30` | 2 to 365 |

Both arguments are optional. The query keeps rows whose `day` falls after `current_date - days`, so `days: 7` covers today and the six days before it, by the database session's date.

### Output

`structuredContent`, which the SDK checks against the tool's output schema:

| field | type | value |
|---|---|---|
| `metric` | string | the metric key |
| `label` | string | the metric's label, such as `HRV (average)` |
| `unit` | string | `ms`, `bpm`, `°C`, `%` or empty |
| `points` | array | `{ "day": string, "value": number }`, oldest first |

`day` is the date as text (`day::text`); the app assumes `YYYY-MM-DD` when it cuts axis labels to `MM-DD`. `value` is the column cast to `float8`. The query skips days where the column is null, so `points` can hold fewer entries than `days`.

`content` holds one text block, which `summarise()` in [server.ts](../../server.ts) writes. It rounds numbers to one decimal and drops each `<unit>`, with the space before it, when the metric has none:

```text title="Summary, with data"
<label> over <n> day(s), <first day> to <last day>: latest <value> <unit>, average <value> <unit>, range <min>–<max> <unit>.
```

```text title="Summary, with no rows"
No <label in lower case> recorded in that window.
```

### Errors

A tool error comes back as a normal result, with `"isError": true` and one text block; the JSON-RPC call itself succeeds:

- Input that fails the schema: `Input validation error: Invalid arguments for tool oura_trend: days: Too small: expected number to be >=2`.
- A failed query: node-postgres's message, passed through unchanged, such as `connect ECONNREFUSED 127.0.0.1:1`.

## Metrics

Each key reads the column of the same name in `daily` (`METRICS` in [db.ts](../../db.ts)). The app's dropdown uses shorter names (`METRIC_LABELS` in [src/mcp-app.ts](../../src/mcp-app.ts)).

| key | label | unit | in the app |
|---|---|---|---|
| `sleep_score` | Sleep score | none | Sleep score |
| `readiness_score` | Readiness score | none | Readiness |
| `activity_score` | Activity score | none | Activity |
| `hrv_avg` | HRV (average) | ms | HRV |
| `rhr_lowest` | Resting heart rate (lowest) | bpm | Resting HR |
| `temp_deviation` | Temperature deviation | °C | Temp deviation |
| `spo2_avg` | SpO2 (average) | % | SpO2 |
| `steps` | Steps | none | Steps |

## The UI resource

`registerAppResource` in [server.ts](../../server.ts) serves the app:

| property | value |
|---|---|
| URI | `ui://oura-trend/mcp-app.html` |
| name | the same as the URI |
| MIME type | `text/html;profile=mcp-app` |
| content | `dist/mcp-app.html`, read from disk on every `resources/read` |
| `_meta.ui.csp` | none, so the app gets no network access |

Reading the resource fails until `npm run build:ui` has written `dist/mcp-app.html`. When the server runs from source (`npm run dev`), it still reads `dist/mcp-app.html`.

### The app

[mcp-app.html](../../mcp-app.html) lays out the controls, and [src/mcp-app.ts](../../src/mcp-app.ts) does the rest:

| part | behaviour |
|---|---|
| metric dropdown | the eight metrics; a change calls the tool again |
| `7d`, `30d`, `90d` | the range; a click calls the tool again |
| status text | `Loading…`, `No data returned.` or `Query failed.` |
| Latest, Average, Low, High | the series' figures, rounded to one decimal |
| chart | line and area; the first and last day as `MM-DD` |
| hover on a point | a tooltip, `<day>: <value> <unit>` |

With one point the app shows `Only one day in range.`, with none `No data in range.`, and draws no chart. `No data returned.` means the result carried no `structuredContent`, which is what a tool error looks like. `Query failed.` means the call itself failed in the host or on the way to the server.

## HTTP endpoints

[main.ts](../../main.ts) serves two routes on `PORT`:

| route | answers |
|---|---|
| `/mcp` | MCP over Streamable HTTP, stateless |
| `/healthz` | `{"status":"ok"}`, without touching the database |

- `/mcp` hands every HTTP method to the SDK's transport (`app.all`); clients POST JSON-RPC messages to it.
- Each request gets a new `McpServer` and transport, and the transport issues no `Mcp-Session-Id`. A request needs no `initialize` before it.
- Replies are server-sent events (`event: message`). A request must accept both `application/json` and `text/event-stream`, or it gets HTTP 406.
- If connecting the server or handling the request throws before a response has started, the reply is HTTP 500 with the JSON-RPC error `-32603`, `Internal server error`. A throwing tool handler does not get here: the SDK turns it into an `isError` result.
- Responses carry `Access-Control-Allow-Origin: *`, from `cors()`.
- `SIGINT` and `SIGTERM` close the HTTP server, then the database pool, then exit with status 0.

### Network exposure

> [!CAUTION]
> On `main` the server has no authentication, listens on every interface, and grants every origin CORS access to responses that hold health data. The README's advice is to keep it on a private network. The server itself does nothing to stop a web page, open in a browser that can reach it, from calling the tool and reading the result.

- **No authentication.** [main.ts](../../main.ts) registers no auth middleware; anyone who can reach the port can call the tool.
- **Every interface.** `main.ts` calls `app.listen(port, …)` without `HOST`, so the socket takes every interface whatever `HOST` says. The startup line prints `HOST` anyway.
- **Every origin.** `app.use(cors())` runs with the `cors` package's defaults: a preflight from any origin gets `204` and `Access-Control-Allow-Origin: *`.

Besides the startup line, `HOST` reaches only `createMcpExpressApp`, which uses it to choose the SDK's DNS-rebinding checks:

| `HOST` | `Host` and `Origin` checks |
|---|---|
| `0.0.0.0` (the default) or `::` | none; the SDK prints a warning at startup |
| `127.0.0.1`, `localhost` or `::1` | a non-loopback `Host` or `Origin` gets 403 |
| anything else | none, and no warning |

The checks stop browsers: a page that rebinds a name to the server, or a page on another origin. A client outside a browser sets its own `Host` header and gets through.

## Environment variables

| variable | default | read by | effect |
|---|---|---|---|
| `DATABASE_URL` | unset | `db.ts` | the Postgres connection string |
| `PORT` | `5010` | `main.ts` | the port to listen on |
| `HOST` | `0.0.0.0` | `main.ts` | picks the `Host` and `Origin` checks |

- `DATABASE_URL` goes to `pg.Pool` as `connectionString`. Where it is unset or leaves a field out, node-postgres falls back to its `PG*` variables (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`) and then to its defaults. Nothing checks it at startup.
- The pool holds at most 4 connections, closes idle ones after 30 seconds, and stops trying to connect after 5 seconds ([db.ts](../../db.ts)).
- `HOST` does not choose the address the server listens on; see [Network exposure](#network-exposure).
- The container image sets `NODE_ENV=production`, `PORT=5010` and `HOST=0.0.0.0` ([Dockerfile](../../Dockerfile)).
- `INPUT` is a build variable: [vite.config.ts](../../vite.config.ts) builds the file it names, default `mcp-app.html`, and `npm run build:ui` sets it to that file.

## The daily table

The one query, from [db.ts](../../db.ts). `${column}` comes from `METRICS`, and `days` binds to `$1`:

```sql title="db.ts"
select day::text as day, ${column}::float8 as value
  from daily
 where ${column} is not null
   and day > current_date - $1::int
 order by day
```

- The table is `daily`, with one row per day ([README](../../README.md#layout-note)). The query needs a `day` column, a `date` it compares with `current_date - days`, and the metric's column, which it casts to `float8`.
- The query reads only the requested column, so a table that lacks a column breaks only that metric.
- Column names come from `METRICS` in db.ts, never from tool input; `days` is a bound parameter.
- The server issues no write. Whether its connection could write depends on the database user in `DATABASE_URL`.

> [!TIP]
> Connect as a database user that can only read `daily`.

## Scripts and the container image

| script | runs |
|---|---|
| `npm run build` | `tsc --noEmit`, then `build:ui`, then `build:server` |
| `npm run build:ui` | Vite: `mcp-app.html` into `dist/mcp-app.html` |
| `npm run build:server` | `bun build`: `server.ts`, `main.ts`, `db.ts` into `dist/` |
| `npm start` | `node dist/main.js` |
| `npm run dev` | `bun --watch main.ts`, restarting on changes |

`package.json` on `main` has no `test` script. `npm run dev` runs the TypeScript sources but serves the UI from `dist/mcp-app.html`: run `npm run build:ui` once first, and again after you change the app.

The [Dockerfile](../../Dockerfile) does not build anything: it copies `dist/`, so run `npm run build` before `docker build`.

| step | what it does |
|---|---|
| base image | `node:24-alpine` |
| dependencies | `npm ci --omit=dev --ignore-scripts` |
| environment | `NODE_ENV=production`, `PORT=5010`, `HOST=0.0.0.0` |
| user | `node` |
| port | exposes 5010 |
| healthcheck | `/healthz` on `127.0.0.1:5010` |
| command | `node dist/main.js` |

The healthcheck runs every 30 seconds, with a 5-second timeout, a 10-second start period and 3 retries. It calls port 5010 whatever `PORT` says. No workflow builds or publishes the image.

## Commit hooks and self-test

The repository is public, and its hooks keep private details out of it ([README](../../README.md#contributing), [.private-terms.example](../../.private-terms.example)). Enable them once per clone:

```bash title="Enable the hooks"
git config core.hooksPath .githooks
cp .private-terms.example .private-terms
```

List in `.private-terms` what must never appear in the repository: one extended regular expression per line, which the hooks match without regard to case, with `#` starting a comment. `.gitignore` lists the file.

- [pre-commit](../../.githooks/pre-commit) blocks a commit when the author or committer is not a `users.noreply.github.com` address, when any text file in the index matches a private term, or when gitleaks finds a secret in the staged changes. It also blocks when `.private-terms` is missing, when a pattern is malformed, and when gitleaks is not installed.
- [commit-msg](../../.githooks/commit-msg) blocks a commit message that matches a private term.

[.githooks/selftest.sh](../../.githooks/selftest.sh) checks the hooks. It needs gitleaks, builds a throwaway repository, and asserts five cases:

```bash title="Run the hooks self-test"
sh .githooks/selftest.sh
```

```text title="Output"
ok: clean commit
ok: term in a staged file
ok: term in the commit message
ok: non-noreply email
ok: malformed pattern
```

CI does not run the self-test. CI's `secrets` job runs `gitleaks-action` and fails when any commit's author or committer is not a GitHub noreply address ([ci.yml](../../.github/workflows/ci.yml)).
