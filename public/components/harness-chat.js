import BaseComponent from "./base-component.js";

class HarnessChat extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "main");
    this.innerHTML = `
      <header class="chatTopbar">
        <span id="socketState" class="state state-idle">Offline</span>
        <div class="columnVisibilityControls" aria-label="Right column visibility">
          <button id="toggleFilesColumnButton" type="button" aria-label="Hide workspace column" aria-pressed="true" title="Hide workspace column"><span aria-hidden="true">▱</span></button>
          <button id="toggleStreamColumnButton" type="button" aria-label="Hide stream column" aria-pressed="true" title="Hide stream column"><span aria-hidden="true">◉</span></button>
        </div>
      </header>
      <section id="messages" class="messages" aria-live="polite">
        <div id="emptyState" class="emptyState">Ask the harness to inspect, edit, or explain this workspace.</div>
      </section>
      <footer class="composerWrap">
        <form id="promptForm" class="composer">
          <div id="imagePreviewList" class="imagePreviewList" aria-live="polite"></div>
          <input id="imageInput" type="file" accept="image/*" multiple hidden>
          <button id="addImageButton" class="composerIcon" type="button" aria-label="Add image" title="Add image">＋</button>
          <textarea id="promptInput" name="prompt" rows="1" placeholder="Ask AI Harness" required></textarea>
          <button id="sendButton" class="sendButton" type="submit" aria-label="Send">↑</button>
        </form>
      </footer>
      <button id="resetButton" class="resetFab" type="button">Reset</button>`;
  }
}

customElements.define("harness-chat", HarnessChat);

export default HarnessChat;
