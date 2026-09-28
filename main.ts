import { createMcpExpressApp } from "@modelcontextprotocol/express"
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node"
import cors from "cors"
import type { Request, Response } from "express"
import { createServer } from "./server.js"
import { close } from "./db.js"

const port = Number.parseInt(process.env.PORT ?? "5010", 10)
const host = process.env.HOST ?? "0.0.0.0"

const app = createMcpExpressApp({ host })
app.use(cors())

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

const httpServer = app.listen(port, (err?: Error) => {
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
