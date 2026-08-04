import os from "node:os";

const DEFAULT_INSTRUCTIONS = `You are a pragmatic coding agent operating in a local workspace.
Inspect the repository before making assumptions. Use tools to read relevant files, make focused
changes, and run verification. Keep existing project conventions. Never claim a command passed
unless you ran it. Avoid destructive commands. Do not access paths outside the workspace.
After every mutation, validate that it succeeded: read created or edited files back, inspect the
result, and run the most relevant available test, build, lint, or status command. Do not report a
task as complete until you have validated its outcome. If validation cannot run or fails, state
that clearly instead of claiming success. When the task is complete, respond concisely with what
changed and the exact validation that ran.`;

function environmentInstructions(root, tools = []) {
  const availableTools = tools
    .filter((tool) => tool.type !== "mcp" && tool.name)
    .map((tool) => `- ${tool.name}: ${tool.description || "Available for this session."}`)
    .join("\n");
  return `${DEFAULT_INSTRUCTIONS}

Workspace root: ${root}
Treat this directory as your current working directory and the root of the repository. Use the
available file tools to inspect and modify files in this workspace. Pass workspace-relative paths
to file tools unless a tool explicitly requests an absolute path.
All file reads and writes must stay inside this workspace.

Tool capability contract:
${availableTools || "- No built-in workspace tools are enabled for this session."}

Every tool listed above is available for you to call in this session. Use list_files, search_files,
and read_file to inspect the workspace rather than guessing about its contents. Use write_file to
create or replace files when it is listed. Use run_command for shell commands such as ls, builds,
and tests when it is listed. Some mutating calls may ask the user for approval; an approval gate
does not mean the tool is unavailable. Call the tool when needed and let the harness handle approval.
Never claim that you lack file or command access without first checking this capability list and
attempting the relevant enabled tool.
Platform: ${process.platform} ${os.release()}
Current date: ${new Date().toISOString().slice(0, 10)}`;
}

// Converts an internal tool implementation into the JSON schema shape expected
// by the Responses API function-calling interface.
function toolDefinition(tool) {
  if (tool.type === "mcp") return tool;
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: tool.strict !== false,
  };
}

// Responses can expose text either as output_text or nested message content.
// This helper hides that response-shape detail from the main agent loop.
function extractText(response) {
  if (response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function promptContent(prompt) {
  if (typeof prompt === "string") {
    return [{ type: "input_text", text: prompt }];
  }
  const text = prompt?.text || "";
  const content = [{ type: "input_text", text }];
  for (const image of prompt?.images || []) {
    if (!image?.dataUrl) continue;
    content.push({
      type: "input_image",
      image_url: image.dataUrl,
    });
  }
  return content;
}

class CodingAgent {
  constructor({
    client,
    tools,
    model,
    root,
    onTool = () => {},
    onInfo = () => {},
    onEvent = () => {},
    onTextDelta = () => {},
    approve = async () => false,
    maxTurns = 30,
  }) {
    this.client = client;
    this.tools = tools;
    this.model = model;
    this.root = root;
    this.onTool = onTool;
    this.onInfo = onInfo;
    this.onEvent = onEvent;
    this.onTextDelta = onTextDelta;
    this.approve = approve;
    this.maxTurns = maxTurns;
    this.previousResponseId = null;
  }

  reset() {
    // previous_response_id links turns server-side. Clearing it starts a fresh
    // conversation while keeping the same model and tool configuration.
    this.previousResponseId = null;
  }

  async run(prompt) {
    this.onEvent({
      type: "start",
      prompt: typeof prompt === "string" ? prompt : prompt?.text || "",
      images: Array.isArray(prompt?.images) ? prompt.images.length : 0,
    });
    // The first request contains the user prompt. Later requests contain only
    // function_call_output items, linked to the prior response ID.
    let input = [{
      role: "user",
      content: promptContent(prompt),
    }];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      this.onEvent({ type: "turn", turn: turn + 1 });
      // Instructions are resent each turn so the model always sees the current
      // workspace, platform, and date alongside the available tools.
      const body = {
        model: this.model,
        instructions: environmentInstructions(this.root, this.tools),
        input,
        tools: this.tools.map(toolDefinition),
        tool_choice: "auto",
        parallel_tool_calls: false,
      };
      if (this.previousResponseId) {
        body.previous_response_id = this.previousResponseId;
      }

      const response = await this.client.createResponse(body, {
        onTextDelta: this.onTextDelta,
      });
      this.previousResponseId = response.id;
      this.onEvent({ type: "response", id: response.id });
      const calls = (response.output || []).filter((item) => item.type === "function_call");
      const mcpCalls = (response.output || []).filter((item) => item.type === "mcp_call");
      const approvalRequests = (response.output || [])
        .filter((item) => item.type === "mcp_approval_request");

      for (const call of mcpCalls) {
        const label = call.server_label || "unknown";
        const name = call.name || call.tool || "unknown";
        this.onInfo(`Using MCP server ${label}.${name}.`);
        this.onEvent({ type: "mcp_call", server: label, name });
      }

      if (approvalRequests.length > 0) {
        input = [];
        for (const request of approvalRequests) {
          const description = `MCP ${request.server_label}.${request.name} ${request.arguments || ""}`.trim();
          this.onInfo(`MCP server ${request.server_label}.${request.name} requested approval.`);
          this.onEvent({
            type: "approval_request",
            server: request.server_label,
            name: request.name,
          });
          this.onTool({
            name: "mcp_approval_request",
            args: {
              server_label: request.server_label,
              tool: request.name,
            },
          });
          const approved = await this.approve(description);
          this.onEvent({
            type: "approval_response",
            server: request.server_label,
            name: request.name,
            approved,
          });
          input.push({
            type: "mcp_approval_response",
            approval_request_id: request.id,
            approve: approved,
            reason: approved ? "Approved by user." : "Denied by user.",
          });
        }
        continue;
      }

      // No function calls means the model has produced its final answer.
      if (calls.length === 0) {
        const text = extractText(response);
        if (!text) throw new Error("The model returned no text or tool calls.");
        this.onEvent({ type: "final", text });
        return text;
      }

      input = [];
      for (const call of calls) {
        // Each tool call result is wrapped in function_call_output and sent back
        // to the model, allowing it to continue reasoning from real local data.
        let args;
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }
        this.onTool({ name: call.name, args });
        this.onEvent({ type: "tool_start", name: call.name, args });
        const tool = this.tools.find((candidate) => candidate.name === call.name);
        let output;
        if (!tool) {
          output = { ok: false, error: `Unknown tool: ${call.name}` };
        } else {
          try {
            output = await tool.execute(args);
          } catch (error) {
            output = { ok: false, error: error.message };
          }
        }
        this.onEvent({ type: "tool_result", name: call.name, output });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
    }

    throw new Error(`Agent exceeded the ${this.maxTurns}-turn limit.`);
  }
}

export { CodingAgent, environmentInstructions, extractText, promptContent };
