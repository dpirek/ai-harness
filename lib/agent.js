import os from "node:os";

const DEFAULT_INSTRUCTIONS = `You are a pragmatic coding agent operating in a local workspace.
Inspect the repository before making assumptions. Use tools to read relevant files, make focused
changes, and run verification. Keep existing project conventions. Never claim a command passed
unless you ran it. Avoid destructive commands. Do not access paths outside the workspace.
When the task is complete, respond concisely with what changed and what verification ran.`;

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
    this.onEvent({ type: "start", prompt });
    // The first request contains the user prompt. Later requests contain only
    // function_call_output items, linked to the prior response ID.
    let input = [{
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      this.onEvent({ type: "turn", turn: turn + 1 });
      // Instructions are resent each turn so the model always sees the current
      // workspace, platform, and date alongside the available tools.
      const body = {
        model: this.model,
        instructions: `${DEFAULT_INSTRUCTIONS}

Workspace: ${this.root}
Platform: ${process.platform} ${os.release()}
Current date: ${new Date().toISOString().slice(0, 10)}`,
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

export { CodingAgent, extractText };
