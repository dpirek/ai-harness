import test from "node:test";
import assert from "node:assert/strict";
import { CodingAgent, extractText } from "../lib/agent.js";

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
