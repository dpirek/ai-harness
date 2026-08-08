import { jsonOptions, requestJson } from "./api-client.js";

async function loadSystemPrompts() {
  const payload = await requestJson("/api/system-prompts", {}, "Unable to load system prompts.");
  return payload.prompts || [];
}

function saveSystemPrompt(key, content) {
  return requestJson("/api/system-prompts", jsonOptions("PUT", { key, content }), "Unable to save system prompt.");
}

function loadProviderModels({ provider, baseUrl, apiKey }) {
  return requestJson(
    "/api/models",
    jsonOptions("POST", { provider, baseUrl, apiKey }),
    "Unable to load models.",
  );
}

function loadConfig() {
  return requestJson("/api/config", {}, "Unable to load config.");
}

function saveConfig(content) {
  return requestJson("/api/config", jsonOptions("PUT", { content }), "Unable to save config.");
}

function loadHealth() {
  return requestJson("/api/health", {}, "Unable to load server health.");
}

export { loadConfig, loadHealth, loadProviderModels, loadSystemPrompts, saveConfig, saveSystemPrompt };
