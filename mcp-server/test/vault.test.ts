import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
    body: [
      "# Summary",
      "Keep scope small.",
      "",
      "## Decisions",
      "- Ship the smallest safe flow.",
      "",
      "## Action items",
      "- Verify create and update.",
      "",
      "## Open questions",
      "- Do we need more later?",
    ].join("\n"),
    ...overrides,
  };
}

function toRelativePath(draft: NoteDraft): string {
  return path.posix.join(
    DEFAULT_SUBFOLDER,
    buildFilename(draft.created, draft.title),
  );
}

function isPrivilegeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code !== undefined &&
    ["EPERM", "EACCES"].includes((error as { code?: string }).code ?? "")
  );
}

async function probeSymlinkSupport(): Promise<{
  supported: boolean;
  skipReason?: string;
}> {
  if (process.platform !== "win32") {
    return { supported: true };
  }

  const probeRoot = await mkdtemp(path.join(os.tmpdir(), "codex-symlink-"));
  const targetPath = path.join(probeRoot, "target");
  const linkPath = path.join(probeRoot, "link");

  try {
    await mkdir(targetPath, { recursive: true });
    await symlink(targetPath, linkPath, "junction");
    return { supported: true };
  } catch (error) {
    if (isPrivilegeError(error)) {
      return {
        supported: false,
        skipReason:
          "Windows symlink/junction creation requires privileges in this environment.",
      };
    }

    throw error;
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

const symlinkSupport = await probeSymlinkSupport();

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

test("findNote returns multiple matching paths for the same codex key", async () => {
  await withTempVault(async (config) => {
    const firstDraft = makeDraft({
      title: "Project alpha",
      codexKey: "shared-codex-key",
      created: "2026-08-16T10:00:00Z",
    });
    const secondDraft = makeDraft({
      title: "Project beta",
      codexKey: "shared-codex-key",
      created: "2026-08-16T11:00:00Z",
    });
    const firstPath = toRelativePath(firstDraft);
    const secondPath = path.posix.join(
      DEFAULT_SUBFOLDER,
      "Nested",
      buildFilename(secondDraft.created, secondDraft.title),
    );

    await createNote(config, firstPath, firstDraft);
    await createNote(config, secondPath, secondDraft);

    assert.deepEqual(await findNote(config, firstDraft.codexKey), [
      firstPath,
      secondPath,
    ]);
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

test(
  "configured folder symlink round-trips create, find, and update through the logical path",
  {
    skip: symlinkSupport.supported ? false : symlinkSupport.skipReason,
  },
  async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "codex-vault-"));
    const logicalFolder = path.join(vaultRoot, "Codex", "Conversations");
    const realFolder = path.join(vaultRoot, "Conversations-Real");
    const config: VaultConfig = {
      vaultRoot,
      relativeSubfolder: DEFAULT_SUBFOLDER,
    };

    await mkdir(path.join(vaultRoot, "Codex"), { recursive: true });
    await mkdir(realFolder, { recursive: true });

    try {
      await symlink(
        realFolder,
        logicalFolder,
        process.platform === "win32" ? "junction" : "dir",
      );

      const draft = makeDraft({
        title: "Logical round trip",
        created: "2026-08-16T12:00:00Z",
        updated: "2026-08-16T12:15:00Z",
      });
      const logicalPath = toRelativePath(draft);
      const realPath = path.join(realFolder, buildFilename(draft.created, draft.title));

      const created = await createNote(config, logicalPath, draft);
      assert.equal(created.relativePath, logicalPath);
      assert.deepEqual(await findNote(config, draft.codexKey), [logicalPath]);

      const updatedDraft = makeDraft({
        title: "Logical round trip",
        created: draft.created,
        updated: "2026-08-16T13:00:00Z",
        body: [
          "# Summary",
          "Updated through the logical path.",
          "",
          "## Decisions",
          "- Ship the smallest safe flow.",
          "",
          "## Action items",
          "- Verify create and update.",
          "",
          "## Open questions",
          "- Do we need more later?",
        ].join("\n"),
      });
      const foundPath = (await findNote(config, draft.codexKey))[0];

      assert.ok(foundPath);
      const updated = await updateNote(config, foundPath, updatedDraft);

      assert.equal(updated.relativePath, logicalPath);
      const updatedContents = await readFile(realPath, "utf8");

      assert.match(updatedContents, /Updated through the logical path\./);
      assert.match(updatedContents, /created: "2026-08-16T12:00:00Z"/);
    } finally {
      await rm(vaultRoot, { recursive: true, force: true });
    }
  },
);

test("update replaces a matching note without changing the created value", async () => {
  await withTempVault(async (config) => {
    const originalDraft = makeDraft();
    const relativePath = toRelativePath(originalDraft);
    const originalPath = resolveVaultPath(config, relativePath);
    const updatedDraft = makeDraft({
      updated: "2026-08-17T09:15:00Z",
      body: [
        "# Summary",
        "Keep the vault flow tiny.",
        "",
        "## Decisions",
        "- Ship the guarded update.",
        "",
        "## Action items",
        "- Verify create and update.",
        "",
        "## Open questions",
        "- Do we need more later?",
      ].join("\n"),
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
      body: [
        "# Summary",
        "This must not be written.",
        "",
        "## Decisions",
        "- Ship the smallest safe flow.",
        "",
        "## Action items",
        "- Verify create and update.",
        "",
        "## Open questions",
        "- Do we need more later?",
      ].join("\n"),
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

test(
  "create rejects a symlinked parent directory that escapes the configured vault",
  {
    skip: symlinkSupport.supported ? false : symlinkSupport.skipReason,
  },
  async () => {
    await withTempVault(async (config) => {
      const escapeRoot = await mkdtemp(path.join(os.tmpdir(), "codex-escape-"));
      const linkedDirectory = path.join(
        config.vaultRoot,
        "Codex",
        "Conversations",
        "Linked",
      );
      const draft = makeDraft({
        title: "Linked escape",
        created: "2026-08-16T12:00:00Z",
      });
      const relativePath = path.posix.join(
        DEFAULT_SUBFOLDER,
        "Linked",
        buildFilename(draft.created, draft.title),
      );

      try {
        await mkdir(escapeRoot, { recursive: true });
        await symlink(escapeRoot, linkedDirectory, "junction");

        await assert.rejects(
          () => createNote(config, relativePath, draft),
          /outside configured folder/i,
        );
        await assert.rejects(
          readFile(path.join(escapeRoot, path.basename(relativePath)), "utf8"),
          (error: unknown) =>
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "ENOENT",
        );
      } finally {
        await rm(escapeRoot, { recursive: true, force: true });
      }
    });
  },
);
