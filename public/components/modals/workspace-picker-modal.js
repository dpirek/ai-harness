import BaseComponent from "../base-component.js";

class WorkspacePickerModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
`;
  }
}

customElements.define("workspace-picker-modal", WorkspacePickerModal);

export default WorkspacePickerModal;
