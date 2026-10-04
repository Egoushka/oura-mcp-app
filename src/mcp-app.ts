/**
 * Oura trend app: renders the tool's daily series as a line chart and lets the
 * viewer re-query without leaving the chat.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps"
import type { CallToolResult } from "@modelcontextprotocol/client"
import "./mcp-app.css"

interface Point {
  day: string
  value: number
}
interface Payload {
  metric: string
  label: string
  unit: string
  points: Point[]
}

const METRIC_LABELS: Record<string, string> = {
  sleep_score: "Sleep score",
  readiness_score: "Readiness",
  activity_score: "Activity",
  hrv_avg: "HRV",
  rhr_lowest: "Resting HR",
  temp_deviation: "Temp deviation",
  spo2_avg: "SpO2",
  steps: "Steps",
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const metricSel = el<HTMLSelectElement>("metric")
const statusEl = el("status")
const statsEl = el("stats")
const chartEl = el("chart")

let days = 30
let busy = false

for (const [value, text] of Object.entries(METRIC_LABELS)) {
  metricSel.add(new Option(text, value))
}

const round = (n: number) => Math.round(n * 10) / 10
const fmt = (n: number, unit: string) => `${round(n)}${unit ? ` ${unit}` : ""}`

function setRangeButtons() {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".range button")) {
    b.classList.toggle("on", Number(b.dataset.days) === days)
  }
}

function render({ label, unit, points }: Payload) {
  chartEl.replaceChildren()
  if (points.length < 2) {
    statsEl.hidden = true
    chartEl.textContent = points.length ? "Only one day in range." : "No data in range."
    return
  }

  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  el("stat-latest").textContent = fmt(values[values.length - 1], unit)
  el("stat-avg").textContent = fmt(values.reduce((a, b) => a + b, 0) / values.length, unit)
  el("stat-min").textContent = fmt(lo, unit)
  el("stat-max").textContent = fmt(hi, unit)
  statsEl.hidden = false

  // viewBox coordinates; CSS scales it to the host's width.
  const W = 720
  const H = 220
  const PAD = { top: 12, right: 12, bottom: 24, left: 40 }
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1)
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom)

  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`)
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", `${label} over ${points.length} days`)

  const node = (name: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(ns, name)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    return n
  }

  // Horizontal guides at low / mid / high.
  for (const v of [lo, lo + span / 2, hi]) {
    svg.append(node("line", { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: "grid" }))
    const t = node("text", { x: PAD.left - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" })
    t.textContent = String(round(v))
    svg.append(t)
  }

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")
  svg.append(node("path", { d: `${line} L${x(points.length - 1)},${H - PAD.bottom} L${x(0)},${H - PAD.bottom} Z`, class: "area" }))
  svg.append(node("path", { d: line, class: "line" }))

  for (const [i, p] of points.entries()) {
    const dot = node("circle", { cx: x(i), cy: y(p.value), r: 7, class: "hit" })
    const title = document.createElementNS(ns, "title")
    title.textContent = `${p.day}: ${fmt(p.value, unit)}`
    dot.append(title)
    svg.append(dot)
  }

  for (const i of [0, points.length - 1]) {
    const t = node("text", {
      x: x(i),
      y: H - 6,
      class: "tick",
      "text-anchor": i === 0 ? "start" : "end",
    })
    t.textContent = points[i].day.slice(5)
    svg.append(t)
  }

  chartEl.append(svg)
}

function readPayload(result: CallToolResult): Payload | null {
  const p = result.structuredContent as Payload | undefined
  return p && Array.isArray(p.points) ? p : null
}

async function load() {
  if (busy) return
  busy = true
  statusEl.textContent = "Loading…"
  try {
    const result = await app.callServerTool({
      name: "oura_trend",
      arguments: { metric: metricSel.value, days },
    })
    const payload = readPayload(result)
    if (payload) {
      render(payload)
      statusEl.textContent = ""
    } else {
      statusEl.textContent = "No data returned."
    }
  } catch (e) {
    console.error(e)
    statusEl.textContent = "Query failed."
  } finally {
    busy = false
  }
}

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

const app = new App({ name: "Oura Trend", version: "0.2.0" })

app.ontoolresult = (result) => {
  const payload = readPayload(result as CallToolResult)
  if (!payload) return
  metricSel.value = payload.metric
  render(payload)
  statusEl.textContent = ""
}
app.onhostcontextchanged = handleHostContext
app.onerror = console.error

metricSel.addEventListener("change", load)
for (const b of document.querySelectorAll<HTMLButtonElement>(".range button")) {
  b.addEventListener("click", () => {
    days = Number(b.dataset.days)
    setRangeButtons()
    void load()
  })
}

setRangeButtons()
app.connect().then(() => {
  const ctx = app.getHostContext()
  if (ctx) handleHostContext(ctx)
})
