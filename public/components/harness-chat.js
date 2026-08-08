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
    const form = this.querySelector("#promptForm");
    const input = this.querySelector("#promptInput");
    const imageInput = this.querySelector("#imageInput");
    form.addEventListener("submit", (event) => { event.preventDefault(); this.emit("submit-prompt"); });
    this.querySelector("#addImageButton").addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => {
      this.emit("images-selected", { files: Array.from(imageInput.files || []) });
      imageInput.value = "";
    });
    input.addEventListener("input", () => { this.resizeInput(); this.emit("prompt-edited"); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); return; }
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); this.emit("navigate-prompt-history", { direction: event.key === "ArrowUp" ? -1 : 1 });
      }
    });
    this.querySelector("#toggleFilesColumnButton").addEventListener("click", () => this.emit("toggle-column", { column: "files" }));
    this.querySelector("#toggleStreamColumnButton").addEventListener("click", () => this.emit("toggle-column", { column: "stream" }));
    this.querySelector("#resetButton").addEventListener("click", () => this.emit("reset-chat"));
  }

  resizeInput() {
    const input = this.querySelector("#promptInput");
    input.style.height = "26px";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
    input.style.overflowY = input.scrollHeight > 168 ? "auto" : "hidden";
  }
}

customElements.define("harness-chat", HarnessChat);

export default HarnessChat;
