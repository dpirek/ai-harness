import BaseComponent from "./base-component.js";

class HarnessSidebar extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Conversation navigation");
    this.innerHTML = `
      <header class="sidebarTop">
        <div class="brand"><img src="/logo.png" alt="" aria-hidden="true"><span>Harness</span></div>
        <button id="sidebarToggleButton" class="sidebarToggle" type="button"
          aria-label="Collapse sidebar" aria-pressed="false" title="Collapse sidebar">☰</button>
      </header>
      <nav class="navList" aria-label="Main">
        <button id="newChatButton" type="button" title="New chat"><span class="navIcon">✎</span><span class="navLabel">New chat</span></button>
        <button id="settingsButton" type="button" title="Providers"><span class="navIcon">◇</span><span class="navLabel">Providers</span></button>
        <button id="systemPromptsButton" type="button" title="System prompts"><span class="navIcon">¶</span><span class="navLabel">System prompts</span></button>
        <button id="toolsButton" type="button" title="Tools"><span class="navIcon">⚒</span><span class="navLabel">Tools</span></button>
        <button id="mcpButton" type="button" title="MCP configuration"><span class="navIcon">⛓</span><span class="navLabel">MCP configuration</span></button>
      </nav>
      <section class="sidebarSection recents" aria-label="Recent conversations">
        <h2>Recents</h2><div id="recentsList" class="recentsList"></div>
      </section>
      <footer class="account">
        <span class="avatar"><img src="/logo.png" alt="" aria-hidden="true"></span>
        <div class="accountMeta"><strong>User Name</strong><span id="workspaceMeta">Connecting...</span></div>
      </footer>`;
  }
}

customElements.define("harness-sidebar", HarnessSidebar);

export default HarnessSidebar;
