import BaseComponent from "../base-component.js";

class McpModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeMcpButton").addEventListener("click", () => dialog.close());
    this.querySelector("#reloadConfigButton").addEventListener("click", () => this.emit("reload-mcp-config"));
    this.querySelector("#saveConfigButton").addEventListener("click", () => this.emit("save-mcp-config"));
    this.querySelector("#reloadToolsButton").addEventListener("click", () => this.emit("reload-mcp-tools"));
    this.querySelector("#showAddToolButton").addEventListener("click", () => this.emit("show-mcp-editor"));
    this.querySelector("#toolTypeSelect").addEventListener("change", () => this.emit("mcp-type-change"));
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("add-mcp-tool"); });
    for (const [id, template] of [["remoteTemplateButton", "remote"], ["stdioTemplateButton", "stdio"], ["autoApproveTemplateButton", "autoApprove"]]) {
      this.querySelector(`#${id}`).addEventListener("click", () => this.emit("append-mcp-template", { template }));
    }
  }
}

customElements.define("mcp-modal", McpModal);

export default McpModal;
