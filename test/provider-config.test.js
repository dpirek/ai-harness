import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  providerSettingsFromRecord,
  resolveProviderApiKey,
  resolveProviderSelection,
} from "../lib/provider-config.js";

test("provider defaults honor provider-specific environment values", () => {
  const env = {
    OPENAI_MODEL: "gpt-env",
    OLLAMA_MODEL: "llama-env",
    CUSTOM_AI_MODEL: "custom-env",
    OPENAI_BASE_URL: "https://openai.example/v1",
    OLLAMA_BASE_URL: "http://ollama.example",
    CUSTOM_AI_BASE_URL: "http://custom.example/v1",
  };
  assert.equal(defaultModelForProvider("openai", env), "gpt-env");
  assert.equal(defaultModelForProvider("ollama", env), "llama-env");
  assert.equal(defaultModelForProvider("custom", env), "custom-env");
  assert.equal(defaultBaseUrlForProvider("openai", env), "https://openai.example/v1");
  assert.equal(defaultBaseUrlForProvider("ollama", env), "http://ollama.example");
  assert.equal(defaultBaseUrlForProvider("custom", env), "http://custom.example/v1");
});

test("provider API keys fall back to provider-specific environment keys", () => {
  const env = {
    OPENAI_API_KEY: "openai-key",
    CUSTOM_AI_API_KEY: "custom-key",
  };
  assert.equal(resolveProviderApiKey("openai", "", env), "openai-key");
  assert.equal(resolveProviderApiKey("custom", "", env), "custom-key");
  assert.equal(resolveProviderApiKey("ollama", "", env), "");
  assert.equal(resolveProviderApiKey("openai", "manual-key", env), "manual-key");
});

test("provider selection resolves saved providers by id, name, and unique type", () => {
  const providers = [
    { id: "prod-openai", name: "Production OpenAI", type: "openai" },
    { id: "local-ollama", name: "Local Ollama", type: "ollama" },
  ];
  assert.deepEqual(resolveProviderSelection("prod-openai", providers), {
    kind: "saved",
    provider: providers[0],
  });
  assert.deepEqual(resolveProviderSelection("local ollama", providers), {
    kind: "saved",
    provider: providers[1],
  });
  assert.deepEqual(resolveProviderSelection("ollama", providers), {
    kind: "saved",
    provider: providers[1],
  });
});

test("provider selection rejects ambiguous type matches and unknown names", () => {
  const providers = [
    { id: "one", name: "OpenAI One", type: "openai" },
    { id: "two", name: "OpenAI Two", type: "openai" },
  ];
  assert.throws(
    () => resolveProviderSelection("openai", providers),
    /Multiple saved openai providers exist/,
  );
  assert.throws(
    () => resolveProviderSelection("missing", providers),
    /Unknown provider "missing"/,
  );
  assert.deepEqual(resolveProviderSelection("custom", providers), {
    kind: "type",
    providerType: "custom",
  });
});

test("provider records are normalized for runtime settings", () => {
  assert.deepEqual(providerSettingsFromRecord({
    type: "custom",
    model: " test-model ",
    baseUrl: " http://localhost:8000/v1 ",
    apiKey: " secret ",
  }), {
    provider: "custom",
    model: "test-model",
    baseUrl: "http://localhost:8000/v1",
    apiKey: "secret",
  });
});
