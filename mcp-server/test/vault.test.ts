import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_SUBFOLDER, type VaultConfig } from "../src/config.js";
import { resolveVaultPath } from "../src/paths.js";
import { buildFilename, renderNote, type NoteDraft } from "../src/notes.js";
import { createNote, findNote, updateNote } from "../src/vault.js";

async function withTempVault(
  run: (config: VaultConfig) => Promise<void>,
): Promise<void> {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-vault-"));
  const config: VaultConfig = {
    vaultRoot,
    relativeSubfolder: DEFAULT_SUBFOLDER,
  };

  await mkdir(path.join(vaultRoot, "Codex", "Conversations"), {
    recursive: true,
  });

  await run(config);
}

function makeDraft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  return {
    title: "Project planning",
    codexKey: "codex-123",
    created: "2026-08-16T10:00:00Z",
    updated: "2026-08-16T10:30:00Z",
    summary: "Keep scope small.",
    decisions: ["Ship the smallest safe flow."],
    actionItems: ["Verify create and update."],
    openQuestions: ["Do we need more later?"],
    ...overrides,
  };
}

function toRelativePath(draft: NoteDraft): string {
  return path.posix.join(
    DEFAULT_SUBFOLDER,
    buildFilename(draft.created, draft.title),
  );
}

test("create writes a new note under the configured folder", async () => {
  await withTempVault(async (config) => {
    const draft = makeDraft();
    const relativePath = toRelativePath(draft);

    const result = await createNote(config, relativePath, draft);
    const expectedPath = resolveVaultPath(config, relativePath);

    assert.deepEqual(result, {
      relativePath,
      absolutePath: expectedPath.absolutePath,
      codexKey: draft.codexKey,
    });
    assert.equal(
      await readFile(expectedPath.absolutePath, "utf8"),
      renderNote(draft),
    );
  });
});

test("create refuses to overwrite an existing note", async () => {
  await withTempVault(async (config) => {
    const draft = makeDraft();
    const relativePath = toRelativePath(draft);
    const expectedPath = resolveVaultPath(config, relativePath);

    await createNote(config, relativePath, draft);
    await assert.rejects(
      () => createNote(config, relativePath, draft),
      /already exists/i,
    );
    assert.equal(
      await readFile(expectedPath.absolutePath, "utf8"),
      renderNote(draft),
    );
  });
});

test("findNote returns matches only from the configured folder", async () => {
  await withTempVault(async (config) => {
    const draft = makeDraft();
    const relativePath = toRelativePath(draft);
    const outsideFolderPath = path.join(config.vaultRoot, "Elsewhere.md");

    await createNote(config, relativePath, draft);
    await writeFile(
      outsideFolderPath,
      renderNote({
        ...draft,
        title: "Outside",
      }),
      "utf8",
    );

    assert.deepEqual(await findNote(config, draft.codexKey), [relativePath]);
  });
});

test("findNote returns no matches when the codex key is absent", async () => {
  await withTempVault(async (config) => {
    const draft = makeDraft();
    const relativePath = toRelativePath(draft);

    await createNote(config, relativePath, draft);

    assert.deepEqual(await findNote(config, "missing-codex-key"), []);
  });
});

test("update replaces a matching note without changing the created value", async () => {
  await withTempVault(async (config) => {
    const originalDraft = makeDraft();
    const relativePath = toRelativePath(originalDraft);
    const originalPath = resolveVaultPath(config, relativePath);
    const updatedDraft = makeDraft({
      updated: "2026-08-17T09:15:00Z",
      summary: "Keep the vault flow tiny.",
      decisions: ["Ship the guarded update."],
    });

    await createNote(config, relativePath, originalDraft);

    const result = await updateNote(config, relativePath, updatedDraft);

    assert.deepEqual(result, {
      relativePath,
      absolutePath: originalPath.absolutePath,
      codexKey: updatedDraft.codexKey,
    });
    assert.equal(
      await readFile(originalPath.absolutePath, "utf8"),
      renderNote({
        ...updatedDraft,
        created: originalDraft.created,
      }),
    );
  });
});

test("update refuses a mismatched codex key without changing the source note", async () => {
  await withTempVault(async (config) => {
    const originalDraft = makeDraft();
    const relativePath = toRelativePath(originalDraft);
    const originalPath = resolveVaultPath(config, relativePath);
    const originalContents = renderNote(originalDraft);
    const mismatchedDraft = makeDraft({
      codexKey: "different-codex-key",
      updated: "2026-08-17T09:15:00Z",
      summary: "This must not be written.",
    });

    await createNote(config, relativePath, originalDraft);
    await assert.rejects(
      () => updateNote(config, relativePath, mismatchedDraft),
      /codex key/i,
    );
    assert.equal(
      await readFile(originalPath.absolutePath, "utf8"),
      originalContents,
    );
  });
});
