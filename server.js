#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { createModelClient } from "./lib/openai.js";
import { CodingAgent } from "./lib/agent.js";
import { createTools } from "./lib/tools.js";
import { loadMcpTools } from "./lib/mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const configPath = path.join(process.cwd(), ".ai-harness/config.toml");

loadEnv(path.join(__dirname, ".env"));
const port = Number(process.env.PORT || 3000);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const providerSettings = new Map();

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRequestBody(req, limit = 250_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleConfigApi(req, res) {
  if (req.method === "GET") {
    try {
      const content = await fs.readFile(configPath, "utf8");
      json(res, 200, { ok: true, exists: true, path: ".ai-harness/config.toml", content });
    } catch (error) {
      if (error.code === "ENOENT") {
        json(res, 200, { ok: true, exists: false, path: ".ai-harness/config.toml", content: "" });
      } else {
        json(res, 500, { ok: false, error: error.message });
      }
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      if (typeof body.content !== "string") {
        json(res, 400, { ok: false, error: "Expected string content." });
        return;
      }
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, body.content, "utf8");
      json(res, 200, {
        ok: true,
        path: ".ai-harness/config.toml",
        bytes: Buffer.byteLength(body.content),
      });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  res.writeHead(405, { allow: "GET, PUT" });
  res.end();
}

function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const target = decoded === "/" ? "/index.html" : decoded;
  const absolute = path.resolve(publicDir, `.${target}`);
  const relative = path.relative(publicDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/favicon.ico") {
    res.writeHead(302, { location: "/favicon.svg" });
    res.end();
    return;
  }
  const filePath = resolvePublicPath(url.pathname);
  if (!filePath) {
    json(res, 403, { ok: false, error: "Path is outside public directory." });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      json(res, 404, { ok: false, error: "Not found." });
      return;
    }
    const contentType = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "cache-control": "no-store",
    });
    res.end(await fs.readFile(filePath));
  } catch (error) {
    if (error.code === "ENOENT") json(res, 404, { ok: false, error: "Not found." });
    else json(res, 500, { ok: false, error: error.message });
  }
}

function sendFrame(socket, payload) {
  if (socket.destroyed) return;
  const data = Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function sendJson(socket, payload) {
  sendFrame(socket, JSON.stringify(payload));
}

function closeSocket(socket, code = 1000, reason = "") {
  if (socket.destroyed) return;
  const reasonBuffer = Buffer.from(reason);
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  socket.write(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
  socket.end();
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("WebSocket frame is too large.");
      }
      length = Number(bigLength);
      cursor += 8;
    }

    if (!masked) throw new Error("Client WebSocket frames must be masked.");
    if (cursor + 4 + length > buffer.length) break;

    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[cursor + index] ^ mask[index % 4];
    }
    cursor += length;
    offset = cursor;

    if (opcode === 0x8) messages.push({ type: "close" });
    else if (opcode === 0x9) messages.push({ type: "ping", payload });
    else if (opcode === 0x1) messages.push({ type: "text", text: payload.toString("utf8") });
  }

  return { messages, remaining: buffer.subarray(offset) };
}

function promptWithHistory(prompt, history) {
  if (!Array.isArray(history) || history.length === 0) return prompt;

  const transcript = history
    .filter((message) => (
      (message.role === "user" || message.role === "agent") &&
      typeof message.text === "string" &&
      message.text.trim()
    ))
    .slice(-20)
    .map((message) => {
      const role = message.role === "agent" ? "Assistant" : "User";
      return `${role}: ${message.text.trim().slice(0, 6000)}`;
    })
    .join("\n\n");

  if (!transcript) return prompt;
  return `Continue this conversation using the prior transcript for context.

Prior transcript:
${transcript}

Current user message:
${prompt}`;
}

async function createAgentSession(socket) {
  const root = process.cwd();
  const settings = providerSettings.get(socket) || {};
  const provider = settings.provider || process.env.AI_PROVIDER || "openai";
  const model = settings.model ||
    process.env.AI_MODEL ||
    (provider === "ollama"
      ? process.env.OLLAMA_MODEL || "llama3.1"
      : process.env.OPENAI_MODEL || "gpt-5.1-codex");
  const approveAll = process.env.AI_HARNESS_WEB_APPROVE === "true";
  const approve = async (description) => {
    sendJson(socket, { type: "approval", description, approved: approveAll });
    return approveAll;
  };
  const onInfo = (message) => sendJson(socket, { type: "info", message });
  const onTool = ({ name, args }) => sendJson(socket, { type: "tool", name, args });
  const onEvent = (event) => sendJson(socket, { type: "agent_event", event });

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Set it in the environment or .env.");
  }

  const client = createModelClient({
    provider,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: settings.baseUrl ||
      (provider === "ollama" ? process.env.OLLAMA_BASE_URL : process.env.OPENAI_BASE_URL),
  });
  const localTools = createTools({ root, approve });
  const mcpTools = await loadMcpTools({ root, approve, onInfo });
  return new CodingAgent({
    client,
    tools: [...localTools, ...mcpTools],
    model,
    root,
    approve,
    onInfo,
    onTool,
    onEvent,
  });
}

function handleWebSocket(socket, req) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}${WEBSOCKET_GUID}`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let frameBuffer = Buffer.alloc(0);
  const agentPromises = new Map();
  let running = false;

  socket.on("data", async (chunk) => {
    try {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      const decoded = decodeFrames(frameBuffer);
      frameBuffer = decoded.remaining;

      for (const message of decoded.messages) {
        if (message.type === "close") {
          closeSocket(socket);
          return;
        }
        if (message.type === "ping") {
          socket.write(Buffer.concat([Buffer.from([0x8a, message.payload.length]), message.payload]));
          continue;
        }
        if (message.type !== "text") continue;

        const payload = JSON.parse(message.text);
        const sessionId = typeof payload.sessionId === "string" && payload.sessionId
          ? payload.sessionId.slice(0, 120)
          : "default";
        if (payload.type === "provider_settings") {
          const provider = payload.provider === "ollama" ? "ollama" : "openai";
          providerSettings.set(socket, {
            provider,
            model: typeof payload.model === "string" ? payload.model.trim() : "",
            baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl.trim() : "",
          });
          agentPromises.clear();
          sendJson(socket, { type: "provider_settings", ok: true, provider });
          continue;
        }
        if (payload.type === "reload_tools") {
          agentPromises.clear();
          sendJson(socket, { type: "reload_tools", ok: true });
          continue;
        }
        if (payload.type === "reset") {
          const agent = await agentPromises.get(sessionId);
          agent?.reset();
          sendJson(socket, { type: "reset", sessionId });
          continue;
        }
        if (payload.type !== "prompt" || typeof payload.prompt !== "string") {
          sendJson(socket, { type: "error", error: "Expected a prompt message." });
          continue;
        }
        if (running) {
          sendJson(socket, { type: "error", error: "A run is already in progress." });
          continue;
        }

        running = true;
        try {
          const hasExistingAgent = agentPromises.has(sessionId);
          if (!hasExistingAgent) {
            agentPromises.set(sessionId, createAgentSession(socket));
          }
          const agent = await agentPromises.get(sessionId);
          const prompt = hasExistingAgent
            ? payload.prompt
            : promptWithHistory(payload.prompt, payload.history);
          const text = await agent.run(prompt);
          sendJson(socket, { type: "done", text, sessionId });
        } catch (error) {
          sendJson(socket, { type: "error", error: error.message, sessionId });
        } finally {
          running = false;
        }
      }
    } catch (error) {
      sendJson(socket, { type: "error", error: error.message });
      closeSocket(socket, 1002, "Protocol error");
    }
  });

  socket.on("error", () => {});
  sendJson(socket, {
    type: "ready",
    provider: process.env.AI_PROVIDER || "openai",
    model: process.env.AI_MODEL ||
      (process.env.AI_PROVIDER === "ollama"
        ? process.env.OLLAMA_MODEL || "llama3.1"
        : process.env.OPENAI_MODEL || "gpt-5.1-codex"),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    approveAll: process.env.AI_HARNESS_WEB_APPROVE === "true",
  });
  socket.on("close", () => providerSettings.delete(socket));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      provider: process.env.AI_PROVIDER || "openai",
      model: process.env.AI_MODEL ||
        (process.env.AI_PROVIDER === "ollama"
          ? process.env.OLLAMA_MODEL || "llama3.1"
          : process.env.OPENAI_MODEL || "gpt-5.1-codex"),
      ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      approveAll: process.env.AI_HARNESS_WEB_APPROVE === "true",
    });
    return;
  }
  if (url.pathname === "/api/config") {
    await handleConfigApi(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    return;
  }
  handleWebSocket(socket, req);
});

server.listen(port, () => {
  console.log(`AI Harness web UI listening on http://localhost:${port}`);
});
