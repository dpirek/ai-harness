import test from "node:test";
import assert from "node:assert/strict";
import {
  CodingAgent,
  environmentInstructions,
  extractText,
  promptContent,
} from "../lib/agent.js";
import { OllamaClient, OpenAIClient, parseTaggedToolCalls } from "../lib/openai.js";

test("extractText reads message output", () => {
  assert.equal(
    extractText({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "done" }],
      }],
    }),
    "done",
  );
});

test("environment instructions identify the workspace and enabled tools", () => {
  const instructions = environmentInstructions("/workspace/project", [
    { name: "list_files", description: "List workspace files." },
    { name: "write_file", description: "Create a workspace file." },
    { name: "run_command", description: "Run a workspace command." },
  ]);

  assert.match(instructions, /Workspace root: \/workspace\/project/);
  assert.match(instructions, /current working directory and the root of the repository/);
  assert.match(instructions, /file tools to inspect and modify files in this workspace/);
  assert.match(instructions, /All file reads and writes must stay inside this workspace/);
  assert.match(instructions, /- list_files: List workspace files/);
  assert.match(instructions, /- write_file: Create a workspace file/);
  assert.match(instructions, /approval gate\s+does not mean the tool is unavailable/);
  assert.match(instructions, /Never claim that you lack file or command access/);
  assert.match(instructions, /After every mutation, validate that it succeeded/);
  assert.match(instructions, /Do not report a\s+task as complete until you have validated its outcome/);
});

test("agent executes a function call and returns final text", async () => {
  const requests = [];
  const responses = [
    {
      id: "resp_1",
      output: [{
        type: "function_call",
        name: "echo",
        call_id: "call_1",
        arguments: '{"value":"hello"}',
      }],
    },
    { id: "resp_2", output_text: "Completed." },
  ];
  const client = {
    async createResponse(body) {
      requests.push(body);
      return responses.shift();
    },
  };
  const tools = [{
    name: "echo",
    description: "Echo input.",
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
    async execute(args) {
      return { ok: true, value: args.value };
    },
  }];
  const agent = new CodingAgent({
    client,
    tools,
    model: "test-model",
    root: "/workspace",
  });

  assert.equal(await agent.run("do it"), "Completed.");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].previous_response_id, "resp_1");
  assert.deepEqual(requests[1].input, [{
    type: "function_call_output",
    call_id: "call_1",
    output: '{"ok":true,"value":"hello"}',
  }]);
});

test("agent passes MCP tool definitions through to the API", async () => {
  const requests = [];
  const client = {
    async createResponse(body) {
      requests.push(body);
      return { id: "resp_1", output_text: "Done." };
    },
  };
  const mcpTool = {
    type: "mcp",
    server_label: "docs",
    server_url: "https://example.com/mcp",
    require_approval: "always",
  };
  const agent = new CodingAgent({
    client,
    tools: [mcpTool],
    model: "test-model",
    root: "/workspace",
  });

  assert.equal(await agent.run("use docs"), "Done.");
  assert.deepEqual(requests[0].tools, [mcpTool]);
});

test("agent answers MCP approval requests", async () => {
  const requests = [];
  const approvals = [];
  const responses = [
    {
      id: "resp_1",
      output: [{
        type: "mcp_approval_request",
        id: "approval_1",
        server_label: "docs",
        name: "search",
        arguments: '{"query":"hello"}',
      }],
    },
    { id: "resp_2", output_text: "Approved." },
  ];
  const client = {
    async createResponse(body) {
      requests.push(body);
      return responses.shift();
    },
  };
  const agent = new CodingAgent({
    client,
    tools: [],
    model: "test-model",
    root: "/workspace",
    async approve(description) {
      approvals.push(description);
      return true;
    },
  });

  assert.equal(await agent.run("search docs"), "Approved.");
  assert.equal(approvals[0], 'MCP docs.search {"query":"hello"}');
  assert.deepEqual(requests[1].input, [{
    type: "mcp_approval_response",
    approval_request_id: "approval_1",
    approve: true,
    reason: "Approved by user.",
  }]);
});

test("agent reports MCP calls returned by the API", async () => {
  const messages = [];
  const client = {
    async createResponse() {
      return {
        id: "resp_1",
        output: [{
          type: "mcp_call",
          server_label: "docs",
          name: "search",
        }],
        output_text: "Done.",
      };
    },
  };
  const agent = new CodingAgent({
    client,
    tools: [],
    model: "test-model",
    root: "/workspace",
    onInfo(message) {
      messages.push(message);
    },
  });

  assert.equal(await agent.run("search docs"), "Done.");
  assert.deepEqual(messages, ["Using MCP server docs.search."]);
});

test("agent emits run events for web streaming", async () => {
  const events = [];
  const client = {
    async createResponse() {
      return { id: "resp_1", output_text: "Done." };
    },
  };
  const agent = new CodingAgent({
    client,
    tools: [],
    model: "test-model",
    root: "/workspace",
    onEvent(event) {
      events.push(event);
    },
  });

  assert.equal(await agent.run("hello"), "Done.");
  assert.deepEqual(events, [
    { type: "start", prompt: "hello", images: 0 },
    { type: "turn", turn: 1 },
    { type: "response", id: "resp_1" },
    { type: "final", text: "Done." },
  ]);
});

test("promptContent includes image inputs", () => {
  assert.deepEqual(promptContent({
    text: "describe this",
    images: [{ dataUrl: "data:image/png;base64,abc" }],
  }), [
    { type: "input_text", text: "describe this" },
    { type: "input_image", image_url: "data:image/png;base64,abc" },
  ]);
});

test("ollama client adapts chat tool calls to response function calls", async () => {
  const requests = [];
  const client = new OllamaClient({
    baseUrl: "http://ollama.test",
    async fetchImpl(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                function: {
                  name: "echo",
                  arguments: { value: "hello" },
                },
              }],
            },
          });
        },
      };
    },
  });

  const response = await client.createResponse({
    model: "llama3.1",
    instructions: "Use tools.",
    input: [{
      role: "user",
      content: [{ type: "input_text", text: "say hello" }],
    }],
    tools: [{
      type: "function",
      name: "echo",
      description: "Echo input.",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
    }],
  });

  assert.equal(requests[0].url, "http://ollama.test/api/chat");
  assert.equal(requests[0].body.messages[0].role, "system");
  assert.equal(requests[0].body.messages[1].content, "say hello");
  assert.deepEqual(response.output, [{
    type: "function_call",
    name: "echo",
    call_id: "call_1",
    arguments: '{"value":"hello"}',
  }]);
});

test("ollama client recognizes tagged textual tool calls", async () => {
  const client = new OllamaClient({
    baseUrl: "http://ollama.test",
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            message: {
              role: "assistant",
              content: `<function=run_command>
<parameter=command>
pwd && ls -la test.txt
</parameter>
<parameter=timeout_ms>
1000
</parameter>
</function>
</tool_call>`,
            },
          });
        },
      };
    },
  });

  const response = await client.createResponse({
    model: "local-model",
    instructions: "Use tools.",
    input: [{ role: "user", content: [{ type: "input_text", text: "inspect files" }] }],
    tools: [{
      type: "function",
      name: "run_command",
      description: "Run a command.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout_ms: { type: ["integer", "null"] },
        },
      },
    }],
  });

  assert.deepEqual(response.output, [{
    type: "function_call",
    name: "run_command",
    call_id: "call_1",
    arguments: '{"command":"pwd && ls -la test.txt","timeout_ms":1000}',
  }]);
});

test("tagged tool parser leaves unknown tool markup as text", () => {
  const result = parseTaggedToolCalls("<function=unknown></function>", []);
  assert.deepEqual(result.calls, []);
  assert.equal(result.content, "<function=unknown></function>");
});

test("ollama client retries without tools for models that do not support them", async () => {
  const requests = [];
  const client = new OllamaClient({
    baseUrl: "http://ollama.test",
    async fetchImpl(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) {
        return {
          ok: false,
          status: 400,
          async text() {
            return JSON.stringify({
              error: "registry.ollama.ai/library/llama3.2-vision:latest does not support tools",
            });
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            message: {
              role: "assistant",
              content: "Tools are unavailable for this model.",
            },
          });
        },
      };
    },
  });

  const response = await client.createResponse({
    model: "llama3.2-vision",
    instructions: "Answer.",
    input: [{
      role: "user",
      content: [{ type: "input_text", text: "hello" }],
    }],
    tools: [{
      type: "function",
      name: "echo",
      description: "Echo input.",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
    }],
  });

  assert.equal(requests.length, 2);
  assert.ok(Array.isArray(requests[0].body.tools));
  assert.equal(Object.hasOwn(requests[1].body, "tools"), false);
  assert.equal(response.output_text, "Tools are unavailable for this model.");
});

test("openai client streams response text deltas", async () => {
  const deltas = [];
  const encoder = new TextEncoder();
  const client = new OpenAIClient({
    apiKey: "test-key",
    baseUrl: "https://api.test",
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"Hel"}\n\n' +
              'data: {"type":"response.output_text.delta","delta":"lo"}\n\n' +
              'data: {"type":"response.completed","response":{"id":"resp_1","output_text":"Hello"}}\n\n',
            ));
            controller.close();
          },
        }),
      };
    },
  });

  const response = await client.createResponse({
    model: "test-model",
    instructions: "Answer.",
    input: [{
      role: "user",
      content: [{ type: "input_text", text: "hello" }],
    }],
    tools: [],
  }, {
    onTextDelta(delta) {
      deltas.push(delta);
    },
  });

  assert.deepEqual(deltas, ["Hel", "lo"]);
  assert.equal(response.output_text, "Hello");
});

test("ollama client streams chat response text deltas", async () => {
  const deltas = [];
  const encoder = new TextEncoder();
  const client = new OllamaClient({
    baseUrl: "http://ollama.test",
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              '{"message":{"role":"assistant","content":"Hel"},"done":false}\n' +
              '{"message":{"role":"assistant","content":"lo"},"done":true}\n',
            ));
            controller.close();
          },
        }),
      };
    },
  });

  const response = await client.createResponse({
    model: "llama3.1",
    instructions: "Answer.",
    input: [{
      role: "user",
      content: [{ type: "input_text", text: "hello" }],
    }],
    tools: [],
  }, {
    onTextDelta(delta) {
      deltas.push(delta);
    },
  });

  assert.deepEqual(deltas, ["Hel", "lo"]);
  assert.equal(response.output_text, "Hello");
});

test("ollama client sends images as base64 chat message images", async () => {
  const requests = [];
  const client = new OllamaClient({
    baseUrl: "http://ollama.test",
    async fetchImpl(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            message: {
              role: "assistant",
              content: "The image shows a chart.",
            },
          });
        },
      };
    },
  });

  await client.createResponse({
    model: "llava",
    instructions: "Analyze images.",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "what is this?" },
        { type: "input_image", image_url: "data:image/png;base64,aW1n" },
      ],
    }],
    tools: [],
  });

  assert.deepEqual(requests[0].body.messages[1], {
    role: "user",
    content: "what is this?",
    images: ["aW1n"],
  });
});
