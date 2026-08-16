import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { VaultConfig } from "./config.js";
import { resolveVaultPath } from "./paths.js";
import { renderNote, type NoteDraft } from "./notes.js";

export interface VaultWriteResult {
  relativePath: string;
  absolutePath: string;
  codexKey: string;
}

async function readFrontmatterValue(
  fileContents: string,
  fieldName: string,
): Promise<string | undefined> {
  const lines = fileContents.split(/\r?\n/);

  if (lines[0] !== "---") {
    return undefined;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === "---") {
      return undefined;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!match || match[1] !== fieldName) {
      continue;
    }

    const rawValue = match[2].trim();

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue.slice(1, -1);
      }
    }

    return rawValue;
  }

  return undefined;
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): string {
  return path
    .relative(vaultRoot, absolutePath)
    .split(path.sep)
    .join("/");
}

function getVaultFolder(config: VaultConfig): string {
  return resolveVaultPath(config, config.relativeSubfolder).absolutePath;
}

async function readMatchingMarkdownFiles(
  directory: string,
  vaultRoot: string,
  codexKey: string,
): Promise<string[]> {
  let directoryEntries;

  try {
    directoryEntries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const matches: string[] = [];

  for (const entry of directoryEntries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      matches.push(
        ...(await readMatchingMarkdownFiles(
          absolutePath,
          vaultRoot,
          codexKey,
        )),
      );
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const contents = await readFile(absolutePath, "utf8");
    const noteCodexKey = await readFrontmatterValue(contents, "codex_key");

    if (noteCodexKey === codexKey) {
      matches.push(toVaultRelativePath(vaultRoot, absolutePath));
    }
  }

  return matches;
}

export async function findNote(
  config: VaultConfig,
  codexKey: string,
): Promise<string[]> {
  const vaultFolder = getVaultFolder(config);
  const matches = await readMatchingMarkdownFiles(
    vaultFolder,
    config.vaultRoot,
    codexKey,
  );

  return matches.sort((left, right) => left.localeCompare(right));
}

export async function createNote(
  config: VaultConfig,
  relativePath: string,
  draft: NoteDraft,
): Promise<VaultWriteResult> {
  const resolvedPath = resolveVaultPath(config, relativePath);
  const nextContents = renderNote(draft);

  await mkdir(path.dirname(resolvedPath.absolutePath), { recursive: true });

  try {
    await writeFile(resolvedPath.absolutePath, nextContents, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Note already exists");
    }

    throw error;
  }

  return {
    relativePath: resolvedPath.relativePath,
    absolutePath: resolvedPath.absolutePath,
    codexKey: draft.codexKey,
  };
}

export async function updateNote(
  config: VaultConfig,
  relativePath: string,
  draft: NoteDraft,
): Promise<VaultWriteResult> {
  const resolvedPath = resolveVaultPath(config, relativePath);
  const existingContents = await readFile(resolvedPath.absolutePath, "utf8");
  const existingCodexKey = await readFrontmatterValue(
    existingContents,
    "codex_key",
  );
  const existingCreated = await readFrontmatterValue(existingContents, "created");

  if (!existingCodexKey) {
    throw new Error("Note codex key is missing");
  }

  if (existingCodexKey !== draft.codexKey) {
    throw new Error("Note codex key does not match");
  }

  if (!existingCreated) {
    throw new Error("Note created value is missing");
  }

  const tempPath = path.join(
    path.dirname(resolvedPath.absolutePath),
    `.${path.basename(resolvedPath.absolutePath)}.${randomUUID()}.tmp`,
  );
  const nextContents = renderNote({
    ...draft,
    created: existingCreated,
  });

  await writeFile(tempPath, nextContents, "utf8");
  await rename(tempPath, resolvedPath.absolutePath);

  return {
    relativePath: resolvedPath.relativePath,
    absolutePath: resolvedPath.absolutePath,
    codexKey: draft.codexKey,
  };
}
