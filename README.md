# AI Coding Harness

A small Codex-style terminal coding agent written with Node.js built-ins only.
It uses the OpenAI Responses API and can inspect files, search code, write files,
and run commands inside the current workspace.

## Requirements

- Node.js 20 or newer
- An OpenAI API key

No `npm install` is required.

## Configure

Create `.env`:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.1-codex
```

`OPENAI_BASE_URL` is optional.

## Run

Interactive mode:

```sh
node index.js
```

Single task:

```sh
node index.js --prompt "Add tests for the parser"
```

Approve every requested file write and command:

```sh
node index.js --yes
```

By default, the harness asks before writing files or executing commands. Reads and
searches are allowed automatically. All tool paths are restricted to the directory
where the harness was launched.

## Test

```sh
node --test
```
