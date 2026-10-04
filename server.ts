import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import { McpServer, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { METRICS, trend, type MetricKey } from "./db.js"

// Resolves whether we run from source (bun main.ts) or from dist/ (node dist/main.js).
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname

const RESOURCE_URI = "ui://oura-trend/mcp-app.html"

const MetricEnum = z.enum(Object.keys(METRICS) as [MetricKey, ...MetricKey[]])

function summarise(metric: MetricKey, points: { day: string; value: number }[]): string {
  const { label, unit } = METRICS[metric]
  if (points.length === 0) return `No ${label.toLowerCase()} recorded in that window.`
  const values = points.map((p) => p.value)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const round = (n: number) => Math.round(n * 10) / 10
  const suffix = unit ? ` ${unit}` : ""
  // Text summary, not just a chart: hosts that cannot render an MCP App
  // (Claude Code, LibreChat) still get something useful from the same call.
  return [
    `${label} over ${points.length} day(s), ${points[0].day} to ${points[points.length - 1].day}:`,
    `latest ${round(values[values.length - 1])}${suffix}, average ${round(avg)}${suffix},`,
    `range ${round(Math.min(...values))}–${round(Math.max(...values))}${suffix}.`,
  ].join(" ")
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "Oura Trends", version: "0.2.0" })

  registerAppTool(
    server,
    "oura_trend",
    {
      title: "Oura trend",
      description:
        "Chart one Oura Ring metric over recent days from the self-hosted warehouse. " +
        "Returns the daily series plus a short text summary.",
      inputSchema: z.object({
        metric: MetricEnum.default("sleep_score").describe("Which daily metric to chart"),
        days: z.number().int().min(2).max(365).default(30).describe("How many days back to look"),
      }),
      outputSchema: z.object({
        metric: z.string(),
        label: z.string(),
        unit: z.string(),
        points: z.array(z.object({ day: z.string(), value: z.number() })),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ metric, days }): Promise<CallToolResult> => {
      const points = await trend(metric, days)
      const { label, unit } = METRICS[metric]
      return {
        content: [{ type: "text", text: summarise(metric, points) }],
        structuredContent: { metric, label, unit, points },
      }
    },
  )

  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8"),
        },
      ],
    }),
  )

  return server
}
