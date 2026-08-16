import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildObsidianOpenUri } from "../src/obsidian-uri.js";
import { buildServer } from "../src/server.js";

test("buildObsidianOpenUri encodes vault and file values for obsidian://open", () => {
  const vaultRoot = path.join("C:", "Vault With Spaces");
  const relativePath = "Codex/Conversations/Project [draft].md";

  assert.equal(
    buildObsidianOpenUri(vaultRoot, relativePath),
    "obsidian://open?vault=Vault%20With%20Spaces&file=Codex%2FConversations%2FProject%20%5Bdraft%5D.md",
  );
});

test("buildServer registers the Task 5 tools", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-task5-vault-"));
  const configFolder = path.join(vaultRoot, "Codex", "Conversations");

  await mkdir(configFolder, { recursive: true });

  const previousVault = process.env.CODEX_OBSIDIAN_VAULT;
  process.env.CODEX_OBSIDIAN_VAULT = vaultRoot;

  const server = buildServer();
  const client = new Client({ name: "task5-smoke", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const { tools } = await client.listTools();
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    assert.deepEqual(
      [...toolMap.keys()].sort(),
      [
        "create_note",
        "find_note",
        "get_status",
        "open_note",
        "update_note",
      ],
    );
    assert.equal(toolMap.get("get_status")?.annotations?.readOnlyHint, true);
    assert.equal(toolMap.get("find_note")?.annotations?.readOnlyHint, true);
    assert.equal(toolMap.get("open_note")?.annotations?.readOnlyHint, true);
    assert.equal(toolMap.get("create_note")?.annotations?.destructiveHint, false);
    assert.equal(toolMap.get("update_note")?.annotations?.destructiveHint, false);
  } finally {
    process.env.CODEX_OBSIDIAN_VAULT = previousVault;
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
