import { jsonOptions, requestJson } from "./api-client.js";

function loadWorkspaceTree(workspace) {
  return requestJson(`/api/workspace-tree?workspace=${encodeURIComponent(workspace)}`, {}, "Unable to load files.");
}

async function loadWorkspaceFile(workspace, path) {
  const payload = await requestJson(
    `/api/workspace-file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`,
    {},
    "Unable to open file.",
  );
  return payload.content;
}

function saveWorkspaceFile(workspace, path, content) {
  return requestJson(
    "/api/workspace-file",
    jsonOptions("PUT", { workspace, path, content }),
    "Unable to save file.",
  );
}

export { loadWorkspaceFile, loadWorkspaceTree, saveWorkspaceFile };
