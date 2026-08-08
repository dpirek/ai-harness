import BaseComponent from "../base-component.js";

class ToolsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.innerHTML = `
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
`;
  }
}

customElements.define("tools-modal", ToolsModal);

export default ToolsModal;
