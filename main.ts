import { createMcpExpressApp } from "@modelcontextprotocol/express"
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node"
import { localhostAllowedHostnames } from "@modelcontextprotocol/server"
import type { Request, Response } from "express"
import { createServer } from "./server.js"
import { close } from "./db.js"

const port = Number.parseInt(process.env.PORT ?? "5010", 10)
// Loopback unless told otherwise; the Docker image sets HOST=0.0.0.0.
const host = process.env.HOST ?? "127.0.0.1"
// Host-header allow-list against DNS rebinding, which CORS cannot stop. Loopback always
// passes, so the image's healthcheck does; any name clients use goes in ALLOWED_HOSTS.
const allowedHosts = [
  ...localhostAllowedHostnames(),
  ...(process.env.ALLOWED_HOSTS?.split(",").map((h) => h.trim()) ?? []),
]

// No CORS: an MCP App's UI reaches this server through its host's postMessage bridge,
// never by fetch, so no web page has a reason to read a response.
const app = createMcpExpressApp({ host, allowedHosts })

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" })
})

// Stateless: a server per request, so a dropped connection cannot wedge state.
app.all("/mcp", async (req: Request, res: Response) => {
  const server = createServer()
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on("close", () => {
    transport.close().catch(() => {})
    server.close().catch(() => {})
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error("MCP error:", error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      })
    }
  }
})

const httpServer = app.listen(port, host, (err?: Error) => {
  if (err) {
    console.error("Failed to start:", err)
    process.exit(1)
  }
  console.log(`Oura MCP App listening on http://${host}:${port}/mcp`)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => {
      close().finally(() => process.exit(0))
    })
  })
}
