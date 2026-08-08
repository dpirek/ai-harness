import "./modals/workspace-picker-modal.js";
import "./modals/file-editor-modal.js";
import "./modals/providers-modal.js";
import "./modals/system-prompts-modal.js";
import "./modals/tools-modal.js";
import "./modals/mcp-modal.js";

const APP_SHELL_TEMPLATE = `
<harness-sidebar class="sidebar"></harness-sidebar>

<column-resize-handle id="sidebarResizeHandle" class="columnResizeHandle sidebarResizeHandle"
  label="Resize navigation column"></column-resize-handle>

<harness-chat class="chat"></harness-chat>

<column-resize-handle id="filesResizeHandle" class="columnResizeHandle filesResizeHandle"
  label="Resize workspace files column"></column-resize-handle>

<workspace-panel class="filesColumn"></workspace-panel>

<column-resize-handle id="streamResizeHandle" class="columnResizeHandle streamResizeHandle"
  label="Resize stream column"></column-resize-handle>

<stream-panel class="streamColumn"></stream-panel>

<workspace-picker-modal></workspace-picker-modal>

<file-editor-modal></file-editor-modal>

<providers-modal></providers-modal>

<system-prompts-modal></system-prompts-modal>

<tools-modal></tools-modal>

<mcp-modal></mcp-modal>
`;

function mountAppShell() {
  const appShell = document.querySelector("#appShell");
  if (!appShell) throw new Error("Application shell mount point is missing.");
  const template = document.createElement("template");
  template.innerHTML = APP_SHELL_TEMPLATE;
  appShell.replaceChildren(template.content.cloneNode(true));
  return appShell;
}

export { mountAppShell };
