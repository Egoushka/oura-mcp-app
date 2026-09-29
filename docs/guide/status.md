---
title: "Status"
description: "What works on main, what is partial and what is not built, with the file or check behind each row, and how to repeat the checks without Oura data."
order: 4
section: "Project"
---

This page describes `main` at version 0.1.0. `works` means the capability is on `main` and does what the linked code says. `partial` means the row names a gap. `not yet` means nothing on `main` does it.

> [!IMPORTANT]
> No test exercises the server, the tool or the app: `package.json` has no `test` script and the repository holds no test files. CI's `build` job type-checks and bundles every push, and nothing in CI runs the result. Each `works` row rests on the code it links and on checks you can repeat, listed under [Check it yourself](#check-it-yourself).

## Summary

| Capability | Status | Evidence |
|---|---|---|
| `oura_trend`: validate, query, return series and summary | works | [server.ts](../../server.ts), [db.ts](../../db.ts) |
| Text summary for hosts without MCP Apps | works | [server.ts](../../server.ts) |
| UI resource as one self-contained HTML file | works | [server.ts](../../server.ts), [vite.config.ts](../../vite.config.ts) |
| Chart app: draw the result, query again via the host | works | [src/mcp-app.ts](../../src/mcp-app.ts) |
| Streamable HTTP, stateless, and `/healthz` | works | [main.ts](../../main.ts) |
| Commit hooks and their self-test | works | [selftest.sh](../../.githooks/selftest.sh) |
| CI: build and secret scan | works | [ci.yml](../../.github/workflows/ci.yml) |
| Following the host's colours and fonts | partial | [src/mcp-app.css](../../src/mcp-app.css) |
| Range and loading state in the app | partial | [src/mcp-app.ts](../../src/mcp-app.ts) |
| Container image | partial | [Dockerfile](../../Dockerfile) |
| DNS-rebinding guard | partial | [main.ts](../../main.ts) |
| Authentication | not yet | [main.ts](../../main.ts) |
| Listening only on `HOST` | not yet | [main.ts](../../main.ts) |
| Refusing CORS requests from other origins | not yet | [main.ts](../../main.ts) |
| Tests for the server and the app | not yet | [package.json](../../package.json) |
| A release, npm package or published image | not yet | [package.json](../../package.json) |

## What works

**`oura_trend`: validate, query, return series and summary.** The input schema in [server.ts](../../server.ts) limits `metric` to the keys of `METRICS` and `days` to whole numbers from 2 to 365, with defaults `sleep_score` and 30; the SDK turns input that fails it into an `isError` result. [db.ts](../../db.ts) runs one parameterised `select` whose column comes from `METRICS`. The result carries the summary in `content` and the series in `structuredContent`, which the SDK checks against the output schema.

**Text summary for hosts without MCP Apps.** `summarise()` in [server.ts](../../server.ts) writes the line into `content` of the same result, and a comment there says it exists for hosts that cannot render an MCP App.

**UI resource as one self-contained HTML file.** `registerAppResource` serves `dist/mcp-app.html` as `ui://oura-trend/mcp-app.html` with the MIME type `text/html;profile=mcp-app` ([server.ts](../../server.ts)). `vite-plugin-singlefile` inlines the script and the styles into that one file ([vite.config.ts](../../vite.config.ts)), and every CI build produces it.

**Chart app: draw the result, query again via the host.** `app.ontoolresult` draws the model's result, and `load()` calls `app.callServerTool` when you change the metric or the range ([src/mcp-app.ts](../../src/mcp-app.ts)). No test drives the app in a browser or a host. The README lists hosts that render MCP Apps; this repository records no run in any of them.

**Streamable HTTP, stateless, and `/healthz`.** [main.ts](../../main.ts) builds a new server and transport for every request and issues no session id. `/healthz` returns `{"status":"ok"}` without querying the database, so it reports on the process alone.

**Commit hooks and their self-test.** [.githooks/selftest.sh](../../.githooks/selftest.sh) builds a throwaway repository and asserts five cases against [pre-commit](../../.githooks/pre-commit) and [commit-msg](../../.githooks/commit-msg): a clean commit passes; a private term in a staged file, a private term in the commit message, a non-noreply email and a malformed pattern each block. It needs gitleaks, and CI does not run it.

**CI: build and secret scan.** [ci.yml](../../.github/workflows/ci.yml) runs on every pull request and every push to `main`. The `build` job sets up Node 24 and Bun, then runs `npm ci` and `npm run build`. The `secrets` job runs `gitleaks-action` and fails when any commit's author or committer is not a GitHub noreply address. Dependabot opens weekly updates for npm packages and GitHub Actions ([dependabot.yml](../../.github/dependabot.yml)).

## What is partial

**Following the host's colours and fonts.** The theme reaches the page as `data-theme` and `color-scheme`, but [src/mcp-app.css](../../src/mcp-app.css) reads `--mcp-*` variables that the MCP Apps style variables do not include. Colours, radius and font stay on the stylesheet's fallbacks in any host that sends the extension's variables. [Following the host's look](architecture.md#following-the-hosts-look) lists the names on both sides.

**Range and loading state in the app.** Four gaps, all in [src/mcp-app.ts](../../src/mcp-app.ts):

- The range buttons start on `30d` and do not follow the model's call. `structuredContent` carries no `days`, so after a call with another window the chart shows that window while `30d` is highlighted, and the next change fetches 30 days.
- `load()` returns at once while a call is in flight. A change made during a call shows in the controls but is not fetched.
- When the model's call fails, `ontoolresult` finds no `structuredContent` and returns without a message: the app shows its controls over an empty chart area.
- The chart spaces points by their position in the series, so a missing day leaves no gap in the line.

**Container image.** The [Dockerfile](../../Dockerfile) packages a build made outside it, and [.dockerignore](../../.dockerignore) admits only the package files and `dist/`. The healthcheck calls port 5010 whatever `PORT` says. No workflow builds, tests or publishes the image.

**DNS-rebinding guard.** The SDK's `Host` and `Origin` checks apply only when `HOST` is `127.0.0.1`, `localhost` or `::1`. With the default, `0.0.0.0`, there are none ([Network exposure](reference.md#network-exposure)). When they apply, they stop browsers; a client outside a browser passes them by sending a loopback `Host`.

## What is not built

**Authentication.** [main.ts](../../main.ts) registers no auth middleware. The README's answer is to keep the server on a private network.

**Listening only on `HOST`.** `main.ts` calls `app.listen(port, …)` without `HOST`, so the socket takes every interface. The startup line prints `HOST` regardless.

**Refusing CORS requests from other origins.** `app.use(cors())` runs with the package's defaults and grants `Access-Control-Allow-Origin: *` to every origin. [SECURITY.md](../../SECURITY.md) asks for reports of "any way for a web page or another origin to read the server's responses"; this is one.

**Tests for the server and the app.** [package.json](../../package.json) has no `test` script, and no test file exists.

**A release, npm package or published image.** The version is 0.1.0 with no git tag. `package.json` sets `"private": true`, and no workflow publishes an image.

## Check it yourself

Building and the hooks self-test need no database and no Oura data. The self-test needs gitleaks.

```bash title="Build, then run the hooks self-test"
npm ci
npm run build
sh .githooks/selftest.sh
```

With a database, the [quickstart](quickstart.md#check-it) calls `/healthz` and the tool with curl. Without one, start the server with a `DATABASE_URL` where nothing listens: `initialize`, `tools/list` and `resources/read` never touch the database, and `tools/call` returns the connection error as an `isError` result.
