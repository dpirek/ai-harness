import BaseComponent from "../base-component.js";

class FileEditorModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
`;
  }
}

customElements.define("file-editor-modal", FileEditorModal);

export default FileEditorModal;
