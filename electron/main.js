import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
let mainWindow;
let serverUrl;
let stopServer;
let quitting = false;

async function ensureServer() {
  if (serverUrl) return serverUrl;

  process.env.AI_HARNESS_DATA_DIR ||= app.getPath("userData");
  process.env.AI_HARNESS_WORKSPACE ||= app.getPath("home");
  const serverModule = await import(pathToFileURL(path.join(appRoot, "server.js")).href);
  const started = await serverModule.startServer({ port: 0, host: "127.0.0.1" });
  serverUrl = started.url;
  stopServer = serverModule.stopServer;
  return serverUrl;
}

async function createWindow() {
  const url = await ensureServer();
  const appOrigin = new URL(url).origin;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#11130f",
    icon: path.join(appRoot, "public", "logo.png"),
    title: "AI Harness",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    const target = new URL(targetUrl);
    if (target.origin === appOrigin) return { action: "allow" };
    if (["http:", "https:", "mailto:"].includes(target.protocol)) void shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const target = new URL(targetUrl);
    if (target.origin === appOrigin) return;
    event.preventDefault();
    if (["http:", "https:", "mailto:"].includes(target.protocol)) void shell.openExternal(targetUrl);
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  await window.loadURL(url);
}

app.setName("AI Harness");

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting || !stopServer) return;
  event.preventDefault();
  quitting = true;
  stopServer()
    .catch((error) => console.error("Failed to stop AI Harness server:", error))
    .finally(() => app.quit());
});
