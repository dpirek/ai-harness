import os from "node:os";

const DEFAULT_INSTRUCTIONS = `You are a pragmatic coding agent operating in a local workspace.
Inspect the repository before making assumptions. Use tools to read relevant files, make focused
changes, and run verification. Keep existing project conventions. Never claim a command passed
unless you ran it. Avoid destructive commands. Do not access paths outside the workspace.
When the task is complete, respond concisely with what changed and what verification ran.`;

function toolDefinition(tool) {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  };
}

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
  constructor({ client, tools, model, root, onTool = () => {}, maxTurns = 30 }) {
    this.client = client;
    this.tools = tools;
    this.model = model;
    this.root = root;
    this.onTool = onTool;
    this.maxTurns = maxTurns;
    this.previousResponseId = null;
  }

  reset() {
    this.previousResponseId = null;
  }

  async run(prompt) {
    let input = [{
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
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

      const response = await this.client.createResponse(body);
      this.previousResponseId = response.id;
      const calls = (response.output || []).filter((item) => item.type === "function_call");

      if (calls.length === 0) {
        const text = extractText(response);
        if (!text) throw new Error("The model returned no text or tool calls.");
        return text;
      }

      input = [];
      for (const call of calls) {
        let args;
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }
        this.onTool({ name: call.name, args });
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
