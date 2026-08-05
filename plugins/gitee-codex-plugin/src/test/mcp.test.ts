import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("the MCP server exposes the Gitee tool set", async () => {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const serverPath = join(currentDirectory, "..", "mcp-server.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: join(currentDirectory, "..", "..")
  });
  const client = new Client({ name: "gitee-plugin-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes("gitee_list_repositories"));
    assert.ok(names.includes("gitee_prepare_upload_project"));
    assert.ok(names.includes("gitee_confirm_upload_project"));
  } finally {
    await transport.close();
  }
});
