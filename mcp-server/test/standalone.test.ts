import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { handleRequest, toolDefinitions } from "../src/standalone.js";

test("standalone MCP runtime exposes the vault tools without SDK imports", async () => {
  const initialized = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "standalone-test", version: "1.0.0" },
    },
  });

  assert.equal(initialized?.id, 1);
  assert.ok(initialized?.result);

  const tools = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  assert.deepEqual(
    (tools?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name).sort(),
    ["create_note", "find_note", "get_status", "open_note", "setup_vault", "update_note"],
  );
  assert.ok(toolDefinitions.every((tool) => tool.inputSchema.type === "object"));
});

test("standalone setup_vault accepts an optional absolute vaultRoot", async () => {
  const configHome = await mkdtemp(path.join(os.tmpdir(), "codex-standalone-config-"));
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-standalone-vault-"));
  const previousAppData = process.env.APPDATA;
  const previousVault = process.env.CODEX_OBSIDIAN_VAULT;
  delete process.env.CODEX_OBSIDIAN_VAULT;
  process.env.APPDATA = configHome;

  try {
    const result = await handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "setup_vault", arguments: { vaultRoot } },
    });

    assert.deepEqual(result?.result?.structuredContent, {
      status: "configured",
      vaultRoot: path.resolve(vaultRoot),
      relativeSubfolder: "Codex/Conversations",
    });
    assert.equal(
      await readFile(path.join(configHome, "codex-to-obsidian", "config.json"), "utf8"),
      JSON.stringify({ vaultRoot: path.resolve(vaultRoot), relativeSubfolder: "Codex/Conversations" }, null, 2) + "\n",
    );
  } finally {
    process.env.APPDATA = previousAppData;
    process.env.CODEX_OBSIDIAN_VAULT = previousVault;
    await rm(configHome, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
