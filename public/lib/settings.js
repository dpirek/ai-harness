const PROVIDER_STORAGE_KEY = "ai-harness.providerSettings";
const TOOL_PERMISSIONS_STORAGE_KEY = "ai-harness.toolPermissions";

const DEFAULT_TOOL_PERMISSIONS = {
  list_files: true,
  read_file: true,
  write_file: true,
  search_files: true,
  curl: true,
  run_command: true,
};

function defaultProviderSettings() {
  return { provider: "openai", model: "gpt-5.1-codex", baseUrl: "", apiKey: "" };
}

function loadProviderSettings() {
  try {
    return { ...defaultProviderSettings(), ...JSON.parse(localStorage.getItem(PROVIDER_STORAGE_KEY) || "{}") };
  } catch {
    localStorage.removeItem(PROVIDER_STORAGE_KEY);
    return defaultProviderSettings();
  }
}

function saveStoredProviderSettings(settings) {
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(settings));
}

function normalizeToolPermissions(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_TOOL_PERMISSIONS).map(([name, defaultValue]) => [
    name,
    typeof value[name] === "boolean" ? value[name] : defaultValue,
  ]));
}

function loadToolPermissions() {
  try {
    return normalizeToolPermissions(JSON.parse(localStorage.getItem(TOOL_PERMISSIONS_STORAGE_KEY) || "{}"));
  } catch {
    localStorage.removeItem(TOOL_PERMISSIONS_STORAGE_KEY);
    return normalizeToolPermissions();
  }
}

function saveStoredToolPermissions(permissions) {
  localStorage.setItem(TOOL_PERMISSIONS_STORAGE_KEY, JSON.stringify(permissions));
}

export {
  defaultProviderSettings,
  loadProviderSettings,
  loadToolPermissions,
  normalizeToolPermissions,
  saveStoredProviderSettings,
  saveStoredToolPermissions,
};
