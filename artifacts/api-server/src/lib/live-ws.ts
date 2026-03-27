/**
 * WebSocket server for real-time live match updates.
 *
 * Accepts connections at any path ending with /ws/live (handles Replit's
 * path-based proxy prefix automatically via suffix matching).
 *
 * Clients receive JSON messages shaped as:
 *   { type: "live:update", data: LiveData, ts: number }
 *
 * The server sends a heartbeat ping every 25 s to keep connections alive
 * through Replit's proxy layer. Dead connections are cleaned up automatically.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";

let wss: WebSocketServer | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Attaches a WebSocket server to the already-created http.Server.
 * Must be called before server.listen().
 */
export function initWebSocket(
  server: import("http").Server
): void {
  wss = new WebSocketServer({ noServer: true });

  // Handle HTTP→WS upgrade requests — match any path ending in /ws/live
  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = req.url?.split("?")[0] ?? "";
      if (pathname.endsWith("/ws/live")) {
        wss!.handleUpgrade(req, socket, head, (ws) => {
          wss!.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    }
  );

  wss.on("connection", (ws) => {
    const size = wss!.clients.size;
    console.log(`[ws] client connected (total: ${size})`);

    // Heartbeat to keep connection alive through proxies
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25_000);

    ws.on("pong", () => {
      // Connection is alive — nothing to do
    });

    ws.on("close", () => {
      clearInterval(ping);
      console.log(`[ws] client disconnected (total: ${wss!.clients.size})`);
    });

    ws.on("error", (err) => {
      console.error("[ws] client error:", err.message);
      clearInterval(ping);
    });
  });

  console.log("[ws] WebSocket server ready — path suffix: /ws/live");
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

/**
 * Pushes a live:update message to every connected client.
 * No-op if no clients are connected or WS server not initialised.
 */
export function broadcastLiveUpdate(data: unknown): void {
  if (!wss || wss.clients.size === 0) return;
  const payload = JSON.stringify({ type: "live:update", data, ts: Date.now() });
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  }
  if (sent > 0) {
    console.log(`[ws] broadcast → ${sent} client(s)`);
  }
}

export function getConnectedClientCount(): number {
  return wss?.clients.size ?? 0;
}
