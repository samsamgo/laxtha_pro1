import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT ?? process.env.FX2_WS_PORT ?? 8080);
const path = process.env.FX2_WS_PATH ?? "/fx2";

let lastPayload = null;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

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

const serveFile = (response, absolutePath) => {
  const extension = extname(absolutePath);
  const contentType = mimeTypes[extension] ?? "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(absolutePath).pipe(response);
};

const serveStaticAsset = (request, response) => {
  if (!existsSync(distDir)) {
    return false;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (requestUrl.pathname === path) {
    return false;
  }

  const requestedPath =
    requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
  const normalizedPath = normalize(requestedPath);
  const absolutePath = join(distDir, normalizedPath);
  const relativePath = relative(distDir, absolutePath);

  if (relativePath.startsWith("..") || relativePath.includes(":")) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return true;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    serveFile(response, absolutePath);
    return true;
  }

  const fallbackPath = join(distDir, "index.html");

  if (existsSync(fallbackPath)) {
    serveFile(response, fallbackPath);
    return true;
  }

  return false;
};

const httpServer = createServer((request, response) => {
  if (serveStaticAsset(request, response)) {
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(
    [
      "FX2 WebSocket bridge is running.",
      "",
      existsSync(distDir) ? "Static dashboard build is being served from /" : "No dist build detected yet.",
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
  if (existsSync(distDir)) {
    console.log(`[bridge] serving static build from ${distDir}`);
  }
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
