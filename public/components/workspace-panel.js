import BaseComponent from "./base-component.js";

class WorkspacePanel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Workspace files");
    this.innerHTML = `
      <div class="filesHeader">
        <div><h2>Workspace</h2><span id="filesWorkspaceLabel">Files</span></div>
        <div class="filesHeaderActions">
          <button id="selectWorkspaceRootButton" type="button" title="Choose workspace folder" aria-label="Choose workspace folder">▱</button>
          <button id="refreshFilesButton" type="button" title="Refresh files" aria-label="Refresh files">↻</button>
        </div>
      </div>
      <input id="workspaceInput" type="text" readonly hidden aria-label="Selected workspace directory">
      <div id="workspaceTree" class="workspaceTree"></div>`;
    const input = this.querySelector("#workspaceInput");
    input.addEventListener("change", () => this.emit("workspace-change"));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault(); input.blur(); this.emit("focus-prompt");
    });
    this.querySelector("#refreshFilesButton").addEventListener("click", () => this.emit("refresh-workspace"));
    this.querySelector("#selectWorkspaceRootButton").addEventListener("click", () => this.emit("choose-workspace"));
  }
}

customElements.define("workspace-panel", WorkspacePanel);

export default WorkspacePanel;
