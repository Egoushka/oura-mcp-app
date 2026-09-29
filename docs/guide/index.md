---
title: "Overview"
description: "What Oura MCP App is, how one tool call returns both a chart and a text summary, what it leaves out, and where it stands at version 0.1.0."
order: 0
section: "Get started"
---

Oura MCP App is an MCP server with one tool, `oura_trend`, that charts one Oura Ring metric over recent days from a Postgres warehouse you run yourself. One call returns the daily series and a one-line text summary. A host that implements [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) renders an interactive chart inline; any other host shows the summary.

## Who it is for

You keep your Oura data in Postgres, in a table named `daily` with one row per day, and you want an assistant to answer a question about a trend with a chart. The table comes from [oura-platform](https://github.com/Egoushka/oura-platform), a separate project. This repository only reads it ([README](../../README.md#layout-note)).

## How it works

`oura_trend` takes a `metric`, one of eight columns of `daily`, and a number of `days`. It runs one `select` over that column and returns the points as `structuredContent` and the summary as text ([server.ts](../../server.ts), [db.ts](../../db.ts)). The tool's metadata names a UI resource, `ui://oura-trend/mcp-app.html`: one HTML file with the chart app inlined by the build ([vite.config.ts](../../vite.config.ts)). A host that implements MCP Apps renders that file and hands it the tool result. The app draws a line chart, and when you switch metric or range it calls the tool again through the host, with no model turn in between ([src/mcp-app.ts](../../src/mcp-app.ts)). [How a chart reaches the host](architecture.md) follows each step.

## What it does not do

- **No authentication.** Anyone who can reach the port can call the tool. On `main` the server also listens on every network interface and answers every origin's CORS preflight; [Network exposure](reference.md#network-exposure) has the details.
- **No writes.** It runs one `select` on `daily` and touches no other table ([db.ts](../../db.ts)). Whether the connection could write depends on the database user you give it.
- **No Oura API.** It reads the warehouse. Filling the warehouse is oura-platform's job.
- **No stdio transport.** Clients connect over Streamable HTTP at `/mcp` ([main.ts](../../main.ts)).
- **No tests.** Nothing exercises the server or the app; CI type-checks and bundles the code ([Status](status.md)).
- **Not a medical device.** The README calls it a personal data tool, says nothing it shows is medical advice, and states that it is not affiliated with or endorsed by Oura.

## Where it stands

- **Version 0.1.0**, in [package.json](../../package.json) and in the version the server reports ([server.ts](../../server.ts)). There is no git tag and no release.
- **Not published.** `package.json` sets `"private": true`, and no workflow builds or pushes a container image. You build it from a clone.
- **CI** type-checks and bundles every push to `main` and every pull request, and runs a secret scan ([ci.yml](../../.github/workflows/ci.yml)).
- **The tool, the UI resource and the chart app work.** Following the host's colours and the container image are partial; authentication and tests do not exist. [Status](status.md) gives the evidence for each.

## Where to go next

- [Quickstart](quickstart.md): build it, run it against your database, call the tool once, connect a client.
- [How a chart reaches the host](architecture.md): the tool, the UI resource and the host bridge.
- [Reference](reference.md): the tool, the metrics, the app, the endpoints, the environment variables, the scripts and the commit hooks.
- [Status](status.md): what works, what is partial and what is not built, with the evidence.
