---
title: "How a chart reaches the host"
description: "The tool, the UI resource and the host bridge: how one call becomes a chart, how the app queries again without the model, and what it takes from the host."
order: 2
section: "Concepts"
---

An MCP App is a tool whose metadata points at an HTML resource. A host that supports the extension renders that resource next to the conversation and connects it to the tool's results. This page follows one call through the files that make up Oura MCP App.

## The moving parts

| file | role |
|---|---|
| [server.ts](../../server.ts) | registers the tool and the UI resource, writes the summary |
| [db.ts](../../db.ts) | the eight metrics and the one query |
| [main.ts](../../main.ts) | HTTP: `/mcp` and `/healthz`, one server per request |
| [mcp-app.html](../../mcp-app.html) and [src/](../../src/) | the chart app |
| [vite.config.ts](../../vite.config.ts) | builds the app into one HTML file |

## One call, step by step

1. **The host lists the tools.** `oura_trend` carries `_meta.ui.resourceUri` set to `ui://oura-trend/mcp-app.html`. `registerAppTool`, from `@modelcontextprotocol/ext-apps`, also writes the same URI under the older flat key `ui/resourceUri`, so a host that reads either finds it.
2. **The model calls the tool.** The server checks `metric` and `days` against the input schema, runs the query, and returns two things in one result: `content`, a single text block with the summary, and `structuredContent`, the series with its label and unit.
3. **The host reads the resource.** `resources/read` on `ui://oura-trend/mcp-app.html` returns `dist/mcp-app.html` with the MIME type `text/html;profile=mcp-app`. The server reads the file from disk on every read, so it serves a rebuilt UI without a restart. Under the MCP Apps extension, the host renders it in a sandboxed frame.
4. **The app connects.** `app.connect()` opens a `postMessage` channel to its parent frame, the host, and performs the `ui/initialize` handshake. The host answers with its context: theme, style variables and fonts.
5. **The host delivers the result.** `app.ontoolresult` reads `structuredContent`, selects the metric in the dropdown, and draws the chart and the four figures above it.

A host that does not implement MCP Apps stops after step 2 and shows the text. That is why [server.ts](../../server.ts) writes a summary at all.

## Querying again without the model

When you pick another metric or range, the app calls the tool itself:

```ts title="src/mcp-app.ts"
const result = await app.callServerTool({
  name: "oura_trend",
  arguments: { metric: metricSel.value, days },
})
```

The host forwards this to the server as `tools/call` and passes the result back to the app. The model takes no turn. The app offers three ranges, 7, 30 and 90 days ([mcp-app.html](../../mcp-app.html)); the model's own call can ask for any whole number of days from 2 to 365.

[main.ts](../../main.ts) builds a new `McpServer` and transport for every HTTP request and gives the transport no session id generator, so the transport issues no `Mcp-Session-Id`. The model's call and each of the app's calls are independent requests, and the server keeps nothing between them.

## Why one HTML file

The host fetches one HTML resource, so the build inlines everything into it: `vite-plugin-singlefile` puts the script and the stylesheet inside `dist/mcp-app.html` ([vite.config.ts](../../vite.config.ts)).

The resource declares no `_meta.ui.csp`. Under the MCP Apps extension, an app that lists no `connectDomains` and no `resourceDomains` gets no network access. This one requests nothing from outside and has no route of its own to the server: its data arrives through the host.

The chart is plain SVG built by `render()` in [src/mcp-app.ts](../../src/mcp-app.ts): a line and a shaded area in a 720 by 220 view box scaled to the frame's width, guides at the low, middle and high values, and a hover target with a native tooltip on every point. No chart library is involved.

## Following the host's look

`handleHostContext()` in [src/mcp-app.ts](../../src/mcp-app.ts) applies what the host sends, once after connecting and again on every host context change:

| host context | what the app does with it |
|---|---|
| `theme` | `applyDocumentTheme` sets `data-theme` and `color-scheme` |
| `styles.variables` | `applyHostStyleVariables` sets each one on the root |
| `styles.css.fonts` | `applyHostFonts` adds the font CSS once |

The stylesheet reads other names. [src/mcp-app.css](../../src/mcp-app.css) takes its colours, radius and font from `--mcp-color-text`, `--mcp-color-text-secondary`, `--mcp-color-accent`, `--mcp-color-surface`, `--mcp-color-border`, `--mcp-radius` and `--mcp-font-sans`. The style variables that `@modelcontextprotocol/ext-apps` 2.0.0 defines carry no `--mcp-` prefix: `--color-text-primary`, `--color-border-primary`, `--font-sans`, `--border-radius-md` and so on.

A host that sends the defined variables sets none of the names the stylesheet reads, so the app draws with its fallbacks: text `#1c1c1e`, accent `#7c5cff`, a system font stack. Only `color-scheme` takes effect, which changes how the browser draws its own controls; the text colour stays `#1c1c1e` in both themes. The README's line that the app matches whichever client renders it does not hold for colours, radius or font. [Status](status.md#what-is-partial) tracks the gap.
