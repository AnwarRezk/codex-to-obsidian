import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildObsidianOpenUri } from "../src/obsidian-uri.js";
import { buildServer } from "../src/server.js";

function isPrivilegeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "EPERM" ||
      (error as { code?: string }).code === "EACCES")
  );
}

test("buildObsidianOpenUri encodes vault and file values for obsidian://open", () => {
  const vaultRoot = path.join("C:", "Vault With Spaces");
  const relativePath = "Codex/Conversations/Project [draft].md";

  assert.equal(
    buildObsidianOpenUri(vaultRoot, relativePath),
    "obsidian://open?vault=Vault%20With%20Spaces&file=Codex%2FConversations%2FProject%20%5Bdraft%5D.md",
  );
});

test("buildObsidianOpenUri keeps the configured vault basename for alias roots", () => {
  const vaultRoot = path.join("C:", "Alias Vault Root");

  assert.match(
    buildObsidianOpenUri(vaultRoot, "Codex/Conversations/Note.md"),
    /vault=Alias%20Vault%20Root&file=Codex%2FConversations%2FNote\.md$/,
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

    const duplicateCreated = (await client.callTool({
      name: "create_note",
      arguments: draft,
    })) as any;

    assert.deepEqual(duplicateCreated.structuredContent, {
      status: "error",
      message: "already exists",
    });
    assert.equal(
      duplicateCreated.content[0] && "text" in duplicateCreated.content[0]
        ? duplicateCreated.content[0].text
        : "",
      "status=error message=already exists",
    );

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

    const unsafeRelativePathError = (await client.callTool({
      name: "create_note",
      arguments: {
        ...draft,
        relativePath: "Drafts/Project Notes.md",
        codex_key: "codex-unsafe",
      },
    })) as any;

    assert.deepEqual(unsafeRelativePathError.structuredContent, {
      status: "error",
      message: "outside configured folder",
    });
    assert.equal(
      unsafeRelativePathError.content[0] && "text" in unsafeRelativePathError.content[0]
        ? unsafeRelativePathError.content[0].text
        : "",
      "status=error message=outside configured folder",
    );

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

    const errorResult = (await client.callTool({
      name: "get_status",
      arguments: {},
    })) as any;

    assert.deepEqual(errorResult.structuredContent, {
      status: "error",
      message: "required or invalid config",
    });

    assert.equal(errorResult.content[0]?.type, "text");
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

    const unsafeVaultPath = path.join(os.tmpdir(), "codex-task5-unsafe-vault.txt");
    await writeFile(unsafeVaultPath, "not a folder", "utf8");
    process.env.CODEX_OBSIDIAN_VAULT = unsafeVaultPath;

    const unsafeErrorResult = (await client.callTool({
      name: "get_status",
      arguments: {},
    })) as any;

    assert.deepEqual(unsafeErrorResult.structuredContent, {
      status: "error",
      message: "required or invalid config",
    });
    assert.equal(
      unsafeErrorResult.content[0] && "text" in unsafeErrorResult.content[0]
        ? unsafeErrorResult.content[0].text
        : "",
      "status=error message=required or invalid config",
    );
    assert.doesNotMatch(
      JSON.stringify(unsafeErrorResult),
      /[A-Za-z]:\\|[A-Za-z]:\//,
    );

    const aliasTargetRoot = await mkdtemp(
      path.join(os.tmpdir(), "codex-task5-alias-target-"),
    );
    const aliasRoot = path.join(os.tmpdir(), "codex-task5-alias-root");

    try {
      await mkdir(path.join(aliasTargetRoot, "Codex", "Conversations"), {
        recursive: true,
      });

      try {
        await symlink(
          aliasTargetRoot,
          aliasRoot,
          process.platform === "win32" ? "junction" : "dir",
        );
      } catch (error) {
        if (isPrivilegeError(error)) {
          return;
        }

        throw error;
      }

      process.env.CODEX_OBSIDIAN_VAULT = aliasRoot;

      const aliasServer = buildServer();
      const aliasClient = new Client({
        name: "task5-alias-smoke",
        version: "1.0.0",
      });
      const [aliasClientTransport, aliasServerTransport] =
        InMemoryTransport.createLinkedPair();

      try {
        await Promise.all([
          aliasClient.connect(aliasClientTransport),
          aliasServer.connect(aliasServerTransport),
        ]);

        const aliasDraft = {
          title: "Alias smoke",
          codex_key: "alias-key",
          relativePath: "Codex/Conversations/Note.md",
          created: "2026-08-16T12:00:00Z",
          updated: "2026-08-16T12:15:00Z",
          summary: "Created through the alias root.",
          decisions: [],
          actionItems: [],
          openQuestions: [],
          sourceUrl: "https://example.test/share/alias-key",
        };

        const aliasCreated = await aliasClient.callTool({
          name: "create_note",
          arguments: aliasDraft,
        });

        assert.deepEqual(aliasCreated.structuredContent, {
          status: "created",
          relativePath: "Codex/Conversations/Note.md",
          codex_key: "alias-key",
        });

        const aliasFound = await aliasClient.callTool({
          name: "find_note",
          arguments: { codex_key: "alias-key" },
        });

        assert.deepEqual(aliasFound.structuredContent, {
          status: "found",
          codex_key: "alias-key",
          matchCount: 1,
          relativePaths: ["Codex/Conversations/Note.md"],
        });

        const aliasResult = (await aliasClient.callTool({
          name: "open_note",
          arguments: { relativePath: "Codex/Conversations/Note.md" },
        })) as any;

        assert.equal(aliasResult.structuredContent?.status, "ok");
        assert.equal(
          aliasResult.structuredContent?.relativePath,
          "Codex/Conversations/Note.md",
        );
        assert.equal(
          aliasResult.structuredContent &&
            typeof aliasResult.structuredContent === "object"
            ? (aliasResult.structuredContent as { uri?: string }).uri
            : undefined,
          buildObsidianOpenUri(aliasRoot, "Codex/Conversations/Note.md"),
        );
      } finally {
        await aliasClient.close().catch(() => undefined);
        await aliasServer.close().catch(() => undefined);
      }
    } finally {
      process.env.CODEX_OBSIDIAN_VAULT = previousVault;
      await rm(aliasRoot, { recursive: true, force: true });
      await rm(aliasTargetRoot, { recursive: true, force: true });
    }
  } finally {
    process.env.CODEX_OBSIDIAN_VAULT = previousVault;
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
