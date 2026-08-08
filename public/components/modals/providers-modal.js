import BaseComponent from "../base-component.js";

class ProvidersModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
`;
  }
}

customElements.define("providers-modal", ProvidersModal);

export default ProvidersModal;
