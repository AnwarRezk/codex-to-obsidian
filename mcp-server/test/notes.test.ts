import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilename,
  renderNote,
  selectOperation,
} from "../src/notes.js";

test("renderNote emits exact markdown with frontmatter and body", () => {
  const note = renderNote({
    title: 'Project "Launch"',
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-17",
    body: [
      "# Summary",
      "A detailed summary.",
      "",
      "## Decisions",
      "- Keep the local MCP boundary.",
    ].join("\n"),
  });

  assert.equal(
    note,
    [
      "---",
      'title: "Project \\"Launch\\""',
      'codex_key: "abc-123"',
      'created: "2026-08-16"',
      'updated: "2026-08-17"',
      "---",
      "",
      "# Summary",
      "A detailed summary.",
      "",
      "## Decisions",
      "- Keep the local MCP boundary.",
    ].join("\n"),
  );
  assert.match(note, /# Summary\nA detailed summary\./);
  assert.doesNotMatch(note, /source_url/i);
  assert.doesNotMatch(note, /Source conversation/);
  assert.doesNotMatch(note, /unavailable/i);
});

test("renderNote preserves multiline markdown bodies", () => {
  const note = renderNote({
    title: "Project planning",
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-16",
    body: [
      "# Summary",
      "",
      "A body with `inline code`.",
      "",
      "## Decisions",
      "- First item",
      "- Second item",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\r\n"),
  });

  assert.equal(
    note,
    [
      "---",
      'title: "Project planning"',
      'codex_key: "abc-123"',
      'created: "2026-08-16"',
      'updated: "2026-08-16"',
      "---",
      "",
      "# Summary",
      "",
      "A body with `inline code`.",
      "",
      "## Decisions",
      "- First item",
      "- Second item",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n"),
  );
});

test("buildFilename produces a filesystem-safe note filename", () => {
  assert.equal(
    buildFilename("2026-08-16T13:37:00Z", 'Project: planning / launch? *draft*'),
    "2026-08-16 - Project planning launch draft.md",
  );
});

test("buildFilename preserves the caller-supplied date prefix from a timezone offset", () => {
  assert.equal(
    buildFilename("2026-08-16T23:30:00-02:00", "Weekly sync"),
    "2026-08-16 - Weekly sync.md",
  );
});

test("buildFilename stays stable for the same created date and title", () => {
  assert.equal(buildFilename("2026-08-16", "Weekly sync"), "2026-08-16 - Weekly sync.md");
  assert.equal(
    buildFilename("2026-08-16T23:59:59Z", "Weekly sync"),
    "2026-08-16 - Weekly sync.md",
  );
});

test("buildFilename guards Windows reserved device names", () => {
  assert.equal(
    buildFilename("2026-08-16", "CON"),
    "2026-08-16 - note-CON-note.md",
  );
});

test("selectOperation returns create for explicit save", () => {
  assert.equal(
    selectOperation({ operation: "save", matchingNoteExists: true }),
    "create",
  );
});

test("selectOperation returns update for explicit update", () => {
  assert.equal(
    selectOperation({ operation: "update", matchingNoteExists: false }),
    "update",
  );
});

test("selectOperation defaults to update when a matching note exists", () => {
  assert.equal(selectOperation({ matchingNoteExists: true }), "update");
});

test("selectOperation defaults to create when no matching note exists", () => {
  assert.equal(selectOperation({ matchingNoteExists: false }), "create");
});

test("selectOperation rejects unknown operation words", () => {
  assert.throws(
    () => selectOperation({ operation: "overwrite", matchingNoteExists: true }),
    /unknown operation/i,
  );
});
