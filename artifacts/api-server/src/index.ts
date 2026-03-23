import app from "./app";

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

app.listen(effectivePort, "0.0.0.0", () => {
  console.log(`Server listening on port ${effectivePort}`);
});
