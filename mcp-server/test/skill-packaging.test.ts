import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
const skillDirectories = [
  path.join(workspaceRoot, "skills"),
  path.join(workspaceRoot, "local-marketplace", "plugins", "codex-to-obsidian", "skills"),
];

async function readSkillMarkdown(directory: string, skillName: string): Promise<string> {
  return readFile(path.join(directory, skillName, "SKILL.md"), "utf8");
}

async function skillExists(directory: string, skillName: string): Promise<boolean> {
  try {
    await access(path.join(directory, skillName, "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

test("skill packaging mirrors split Obsidian workflows without source metadata", async () => {
  const [rootDirectory, packagedDirectory] = skillDirectories;

  assert.equal(await skillExists(rootDirectory, "summarize-to-obsidian"), true);
  assert.equal(await skillExists(packagedDirectory, "summarize-to-obsidian"), true);
  assert.equal(await skillExists(rootDirectory, "save-to-obsidian"), true);
  assert.equal(await skillExists(packagedDirectory, "save-to-obsidian"), true);
  assert.equal(await skillExists(rootDirectory, "save-conversation"), false);
  assert.equal(await skillExists(packagedDirectory, "save-conversation"), false);

  const rootSummarize = await readSkillMarkdown(rootDirectory, "summarize-to-obsidian");
  const packagedSummarize = await readSkillMarkdown(packagedDirectory, "summarize-to-obsidian");
  const rootSave = await readSkillMarkdown(rootDirectory, "save-to-obsidian");
  const packagedSave = await readSkillMarkdown(packagedDirectory, "save-to-obsidian");

  assert.equal(packagedSummarize, rootSummarize);
  assert.equal(packagedSave, rootSave);

  for (const markdown of [
    rootSummarize,
    packagedSummarize,
    rootSave,
    packagedSave,
  ]) {
    assert.doesNotMatch(markdown, /sourceUrl|source_url|Source conversation/i);
  }
});
