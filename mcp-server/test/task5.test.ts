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

test("Task 5 tool RPCs accept codex_key inputs and redact errors", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-task5-vault-"));
  const configFolder = path.join(vaultRoot, "Codex", "Conversations");
  const missingVaultRoot = path.join(os.tmpdir(), "codex-task5-missing-vault");
  const relativePath = "Codex/Conversations/2026-08-16 - Task 5.md";

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
    assert.ok(
      toolMap.get("create_note")?.inputSchema?.required?.includes("codex_key"),
    );
    assert.ok(
      toolMap.get("find_note")?.inputSchema?.required?.includes("codex_key"),
    );

    const status = await client.callTool({
      name: "get_status",
      arguments: {},
    });

    assert.deepEqual(status.structuredContent, {
      status: "ready",
      relativeSubfolder: "Codex/Conversations",
    });

    const draft = {
      title: "Task 5 smoke",
      codex_key: "codex-123",
      relativePath,
      created: "2026-08-16T10:00:00Z",
      updated: "2026-08-16T10:30:00Z",
      summary: "Keep the handler surface tight.",
      decisions: ["Use codex_key on the wire."],
      actionItems: ["Verify the MCP result shapes."],
      openQuestions: ["Does the redacted error stay generic?"],
      sourceUrl: "https://example.test/share/codex-123",
    };

    const created = await client.callTool({
      name: "create_note",
      arguments: draft,
    });

    assert.deepEqual(created.structuredContent, {
      status: "created",
      relativePath,
      codex_key: "codex-123",
    });

    const found = await client.callTool({
      name: "find_note",
      arguments: { codex_key: "codex-123" },
    });

    assert.deepEqual(found.structuredContent, {
      status: "found",
      codex_key: "codex-123",
      matchCount: 1,
      relativePaths: [relativePath],
    });

    const updated = await client.callTool({
      name: "update_note",
      arguments: {
        ...draft,
        updated: "2026-08-16T11:00:00Z",
        summary: "Updated through the tool call.",
      },
    });

    assert.deepEqual(updated.structuredContent, {
      status: "updated",
      relativePath,
      codex_key: "codex-123",
    });

    const opened = await client.callTool({
      name: "open_note",
      arguments: { relativePath },
    });

    assert.deepEqual(opened.structuredContent, {
      status: "ok",
      relativePath,
      uri: buildObsidianOpenUri(vaultRoot, relativePath),
    });

    process.env.CODEX_OBSIDIAN_VAULT = missingVaultRoot;

    const errorResult = await client.callTool({
      name: "get_status",
      arguments: {},
    });

    assert.deepEqual(errorResult.structuredContent, {
      status: "error",
      message: "required or invalid config",
    });

    assert.equal(
      errorResult.content[0]?.type,
      "text",
    );
    assert.equal(
      errorResult.content[0] && "text" in errorResult.content[0]
        ? errorResult.content[0].text
        : "",
      "status=error message=required or invalid config",
    );
    assert.doesNotMatch(
      JSON.stringify(errorResult.structuredContent),
      /[A-Za-z]:\\|[A-Za-z]:\//,
    );
  } finally {
    process.env.CODEX_OBSIDIAN_VAULT = previousVault;
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
