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

<dialog id="workspacePickerDialog" class="workspacePickerDialog">
  <form method="dialog" class="workspacePickerPanel">
    <header><div><h2>Select workspace folder</h2><p id="workspacePickerPath">Choose a folder</p></div>
      <div><button id="parentWorkspacePickerButton" type="button" title="Go to parent folder" aria-label="Go to parent folder">↑</button>
      <button id="closeWorkspacePickerButton" type="button" aria-label="Close folder picker">×</button></div></header>
    <div id="workspacePickerTree" class="workspacePickerTree"></div>
    <footer><button type="button" id="cancelWorkspacePickerButton">Cancel</button>
      <button type="button" id="confirmWorkspacePickerButton" class="primaryButton">Select folder</button></footer>
  </form>
</dialog>

<dialog id="fileEditorDialog" class="fileEditorDialog">
  <form id="fileEditorForm" class="fileEditorPanel">
    <header><div><h2 id="fileEditorTitle">Edit file</h2><p id="fileEditorPath"></p></div>
      <button id="closeFileEditorButton" type="button" aria-label="Close file editor">×</button></header>
    <textarea id="fileEditorContent" spellcheck="false" aria-label="File content"></textarea>
    <footer><span id="fileEditorStatus" role="status"></span><div>
      <button id="cancelFileEditorButton" type="button">Cancel</button>
      <button id="saveFileEditorButton" class="primaryButton" type="submit">Save</button>
    </div></footer>
  </form>
</dialog>

<dialog id="settingsDialog" class="settingsDialog">
  <form id="settingsForm" class="settingsPanel" method="dialog">
    <header class="settingsHeader">
      <div>
        <h2>Providers</h2>
        <p>Manage AI providers, credentials, and models</p>
      </div>
      <button id="closeSettingsButton" class="iconButton" type="button" aria-label="Close providers">×</button>
    </header>

    <section id="providerSettings" class="providerSettings" aria-label="AI provider settings">
      <div class="providerTableToolbar">
        <strong>Providers</strong>
        <button id="addProviderButton" type="button">Add provider</button>
      </div>
      <div class="providerTableWrap">
        <table class="providerTable">
          <thead><tr><th>Use</th><th>Name</th><th>Type</th><th>Model</th><th>API key</th><th></th></tr></thead>
          <tbody id="providersTableBody"></tbody>
        </table>
      </div>
      <div id="providerEditor" class="providerEditor" hidden>
        <label><span>Name</span><input id="providerNameInput" type="text" placeholder="My OpenAI"></label>
        <label><span>Type</span><select id="providerSelect">
          <option value="openai">OpenAI</option><option value="ollama">Ollama</option><option value="custom">Custom</option>
        </select></label>
        <label><span>Model</span><select id="providerModelInput"></select></label>
        <label><span>Base URL</span><input id="providerBaseUrlInput" type="url" placeholder="http://localhost:11434"></label>
        <label id="providerApiKeyField"><span>API key</span>
          <input id="providerApiKeyInput" type="password" autocomplete="off" placeholder="Optional bearer token">
        </label>
        <div class="providerModelActions">
          <button id="refreshModelsButton" type="button">Refresh models</button>
          <span id="providerModelsStatus">Models not loaded</span>
        </div>
      </div>
    </section>

    <footer class="settingsFooter">
      <span id="settingsStatus" class="configStatus">Provider settings are stored in SQLite.</span>
      <div>
        <button id="saveSettingsButton" class="primaryButton" type="submit">Save</button>
      </div>
    </footer>
  </form>
</dialog>

<dialog id="systemPromptsDialog" class="settingsDialog">
  <form id="systemPromptsForm" class="settingsPanel">
    <header class="settingsHeader">
      <div><h2>System prompts</h2><p>Configure the instructions used for new agent sessions</p></div>
      <button id="closeSystemPromptsButton" class="iconButton" type="button" aria-label="Close system prompts">×</button>
    </header>
    <section id="systemPromptsList" class="systemPromptsList"></section>
    <section id="systemPromptEditor" class="systemPromptEditor" hidden>
      <label><span id="systemPromptEditorTitle">Prompt</span>
        <textarea id="systemPromptContent" class="configInput" spellcheck="false"></textarea>
      </label>
    </section>
    <footer class="settingsFooter">
      <span id="systemPromptsStatus" class="configStatus">Defaults are stored in SQLite.</span>
      <div><button id="saveSystemPromptButton" class="primaryButton" type="submit" hidden>Save prompt</button></div>
    </footer>
  </form>
</dialog>

<dialog id="toolsDialog" class="settingsDialog">
  <form id="toolsForm" class="settingsPanel" method="dialog">
    <header class="settingsHeader">
      <div>
        <h2>Tools</h2>
        <p>Choose which built-in workspace tools the model can call</p>
      </div>
      <button id="closeToolsButton" class="iconButton" type="button" aria-label="Close tools">×</button>
    </header>

    <section class="toolPermissions" aria-label="Local tool permissions">
      <div class="toolPermissionsHeader">
        <h3>Allowed Tool Calls</h3>
        <p>Enabled tools are authorized to run without an additional prompt.</p>
      </div>
      <div class="toolTableWrap">
        <table class="toolTable">
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">Description</th>
              <th scope="col">Enabled</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">List files</th>
              <td>List files and folders inside the workspace.</td>
              <td><input type="checkbox" data-tool-permission="list_files" aria-label="Enable list files"></td>
            </tr>
            <tr>
              <th scope="row">Search files</th>
              <td>Search workspace text files with a regular expression.</td>
              <td><input type="checkbox" data-tool-permission="search_files" aria-label="Enable search files"></td>
            </tr>
            <tr>
              <th scope="row">Read files</th>
              <td>Read selected UTF-8 file contents from the workspace.</td>
              <td><input type="checkbox" data-tool-permission="read_file" aria-label="Enable read files"></td>
            </tr>
            <tr>
              <th scope="row">Write files</th>
              <td>Create or replace UTF-8 files in the workspace.</td>
              <td><input type="checkbox" data-tool-permission="write_file" aria-label="Enable write files"></td>
            </tr>
            <tr>
              <th scope="row">Curl</th>
              <td>Fetch HTTP or HTTPS URLs for API and web inspection.</td>
              <td><input type="checkbox" data-tool-permission="curl" aria-label="Enable curl"></td>
            </tr>
            <tr>
              <th scope="row">Run commands</th>
              <td>Run shell commands in the workspace.</td>
              <td><input type="checkbox" data-tool-permission="run_command" aria-label="Enable run commands"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer class="settingsFooter">
      <span id="toolPermissionsStatus" class="configStatus">Tool permissions are stored in SQLite.</span>
      <div>
        <button id="saveToolPermissionsButton" class="primaryButton" type="submit">Save tools</button>
      </div>
    </footer>
  </form>
</dialog>

<dialog id="mcpDialog" class="settingsDialog">
  <form id="mcpForm" class="settingsPanel" method="dialog">
    <header class="settingsHeader">
      <div>
        <h2>MCP Configuration</h2>
        <p>Add MCP servers stored in SQLite</p>
      </div>
      <button id="closeMcpButton" class="iconButton" type="button" aria-label="Close MCP configuration">×</button>
    </header>

    <div id="mcpTableToolbar" class="providerTableToolbar">
      <strong>Configured servers</strong>
      <div>
        <button id="reloadToolsButton" type="button">Reload</button>
        <button id="showAddToolButton" type="button">Add server</button>
      </div>
    </div>

    <section id="mcpEditor" class="toolsAddPanel" aria-label="Add MCP server" hidden>
      <label>
        <span>Type</span>
        <select id="toolTypeSelect">
          <option value="remote">Remote MCP</option>
          <option value="stdio">Local stdio MCP</option>
        </select>
      </label>
      <label>
        <span>Label</span>
        <input id="toolLabelInput" type="text" placeholder="docs">
      </label>
      <label class="remoteToolField">
        <span>Server URL</span>
        <input id="toolUrlInput" type="url" placeholder="https://example.com/mcp">
      </label>
      <label class="stdioToolField">
        <span>Command</span>
        <input id="toolCommandInput" type="text" placeholder="node">
      </label>
      <label class="stdioToolField">
        <span>Args</span>
        <input id="toolArgsInput" type="text" placeholder="/absolute/path/to/server.js">
      </label>
      <label class="stdioToolField">
        <span>CWD</span>
        <input id="toolCwdInput" type="text" placeholder="/absolute/path/to/server">
      </label>
      <button id="addToolButton" class="primaryButton" type="submit">Save server</button>
    </section>

    <section class="toolsListPanel" aria-label="Configured MCP servers">
      <div class="mcpListHeader"><span>Name</span><span>Type</span><span>Target</span><span>Status</span></div>
      <div id="toolsList" class="toolsList"></div>
    </section>

    <div class="settingsTemplates" aria-label="Config templates" hidden>
      <button id="remoteTemplateButton" type="button">Remote MCP</button>
      <button id="stdioTemplateButton" type="button">Local stdio MCP</button>
      <button id="autoApproveTemplateButton" type="button">Auto approve MCP</button>
    </div>

    <textarea
      id="configInput"
      class="configInput"
      spellcheck="false"
      placeholder="# MCP configuration stored in SQLite"
      hidden
    ></textarea>

    <footer class="settingsFooter">
      <span id="toolsStatus" class="configStatus">Not loaded</span>
      <span id="configStatus" class="configStatus" hidden>Config not loaded</span>
      <div hidden>
        <button id="reloadConfigButton" type="button">Reload config</button>
        <button id="saveConfigButton" class="primaryButton" type="button">Save MCP config</button>
      </div>
    </footer>
  </form>
</dialog>
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
