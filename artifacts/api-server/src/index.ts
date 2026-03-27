import { createServer } from "http";
import app from "./app";
import { initWebSocket } from "./lib/live-ws";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  console.error(`[server] Invalid PORT value: "${rawPort}" — defaulting to 3000`);
}

const effectivePort = Number.isNaN(port) || port <= 0 ? 3000 : port;

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

// Create a plain HTTP server so Express and the WebSocket server share one port
const httpServer = createServer(app);

// Attach WebSocket server (handles upgrade events for /ws/live paths)
initWebSocket(httpServer);

httpServer.listen(effectivePort, "0.0.0.0", () => {
  console.log(`Server listening on port ${effectivePort}`);
});
