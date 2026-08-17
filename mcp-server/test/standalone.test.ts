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
  const toolMap = new Map(
    ((tools?.result as { tools: Array<{ name: string; inputSchema: { required?: string[] } }> }).tools).map((tool) => [
      tool.name,
      tool,
    ]),
  );
  assert.deepEqual(toolMap.get("create_note")?.inputSchema.required, [
    "title",
    "codex_key",
    "relativePath",
    "created",
    "updated",
    "body",
  ]);
  assert.deepEqual(toolMap.get("update_note")?.inputSchema.required, [
    "title",
    "codex_key",
    "relativePath",
    "created",
    "updated",
    "body",
  ]);
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

test("standalone create_note and update_note write body-only notes without source metadata", async () => {
  const configHome = await mkdtemp(path.join(os.tmpdir(), "codex-standalone-config-"));
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-standalone-vault-"));
  const previousAppData = process.env.APPDATA;
  const previousVault = process.env.CODEX_OBSIDIAN_VAULT;
  delete process.env.CODEX_OBSIDIAN_VAULT;
  process.env.APPDATA = configHome;

  const relativePath = "Codex/Conversations/2026-08-17 - Standalone.md";

  try {
    const setupResult = await handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "setup_vault", arguments: { vaultRoot } },
    });

    assert.deepEqual(setupResult?.result?.structuredContent, {
      status: "configured",
      vaultRoot: path.resolve(vaultRoot),
      relativeSubfolder: "Codex/Conversations",
    });

    const createResult = await handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "create_note",
        arguments: {
          title: "Standalone body smoke",
          codex_key: "standalone-body-smoke",
          relativePath,
          created: "2026-08-17T10:00:00Z",
          updated: "2026-08-17T10:10:00Z",
          body: ["# Summary", "Created by the standalone server."].join("\n"),
        },
      },
    });

    assert.deepEqual(createResult?.result?.structuredContent, {
      status: "created",
      relativePath,
      codex_key: "standalone-body-smoke",
    });

    const createdNote = await readFile(path.join(vaultRoot, relativePath), "utf8");
    assert.match(createdNote, /# Summary\nCreated by the standalone server\./);
    assert.doesNotMatch(createdNote, /source_url:/i);
    assert.doesNotMatch(createdNote, /## Source conversation/);

    const updateResult = await handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "update_note",
        arguments: {
          title: "Standalone body smoke",
          codex_key: "standalone-body-smoke",
          relativePath,
          created: "2026-08-17T10:00:00Z",
          updated: "2026-08-17T10:20:00Z",
          body: ["# Summary", "Updated by the standalone server.", "", "## Decisions", "- Keep body-only writes."].join(
            "\n",
          ),
        },
      },
    });

    assert.deepEqual(updateResult?.result?.structuredContent, {
      status: "updated",
      relativePath,
      codex_key: "standalone-body-smoke",
    });

    const updatedNote = await readFile(path.join(vaultRoot, relativePath), "utf8");
    assert.match(updatedNote, /# Summary\nUpdated by the standalone server\./);
    assert.match(updatedNote, /## Decisions\n- Keep body-only writes\./);
    assert.doesNotMatch(updatedNote, /source_url:/i);
    assert.doesNotMatch(updatedNote, /## Source conversation/);
  } finally {
    process.env.APPDATA = previousAppData;
    process.env.CODEX_OBSIDIAN_VAULT = previousVault;
    await rm(configHome, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
