import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.FX2_WS_PORT ?? 8080);
const path = process.env.FX2_WS_PATH ?? "/fx2";

let lastPayload = null;

const getWebSocketUrls = () => {
  const hosts = new Set(["localhost", "127.0.0.1"]);

  Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .forEach((address) => {
      if (!address.internal && address.family === "IPv4") {
        hosts.add(address.address);
      }
    });

  return Array.from(hosts).map((host) => `ws://${host}:${port}${path}`);
};

const httpServer = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(
    [
      "FX2 WebSocket bridge is running.",
      "",
      "Connect your web or app client to one of these URLs:",
      ...getWebSocketUrls().map((url) => `- ${url}`),
    ].join("\n")
  );
});

const webSocketServer = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (requestUrl.pathname !== path) {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (client) => {
    webSocketServer.emit("connection", client, request);
  });
});

webSocketServer.on("connection", (client, request) => {
  const remoteAddress = `${request.socket.remoteAddress ?? "unknown"}:${request.socket.remotePort ?? "?"}`;

  console.log(`[bridge] connected ${remoteAddress}`);

  if (lastPayload) {
    client.send(lastPayload);
  }

  client.on("message", (rawMessage, isBinary) => {
    if (isBinary) {
      console.warn(`[bridge] ignored binary payload from ${remoteAddress}`);
      return;
    }

    const textPayload = rawMessage.toString();

    try {
      lastPayload = JSON.stringify(JSON.parse(textPayload));
    } catch {
      console.warn(`[bridge] ignored non-JSON payload from ${remoteAddress}`);
      return;
    }

    let deliveredCount = 0;

    webSocketServer.clients.forEach((peer) => {
      if (peer.readyState !== WebSocket.OPEN) {
        return;
      }

      peer.send(lastPayload);
      deliveredCount += 1;
    });

    console.log(`[bridge] relayed payload to ${deliveredCount} client(s)`);
  });

  client.on("close", () => {
    console.log(`[bridge] disconnected ${remoteAddress}`);
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[bridge] listening on 0.0.0.0:${port}${path}`);
  getWebSocketUrls().forEach((url) => {
    console.log(`[bridge] client URL: ${url}`);
  });
  console.log("[bridge] press Ctrl+C to stop");
});

process.on("SIGINT", () => {
  console.log("\n[bridge] shutting down");
  webSocketServer.close(() => {
    httpServer.close(() => process.exit(0));
  });
});
