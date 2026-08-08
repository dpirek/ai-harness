import BaseComponent from "../base-component.js";

class SystemPromptsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
`;
  }
}

customElements.define("system-prompts-modal", SystemPromptsModal);

export default SystemPromptsModal;
