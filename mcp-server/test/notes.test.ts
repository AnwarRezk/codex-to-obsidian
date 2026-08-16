import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilename,
  renderNote,
  selectOperation,
} from "../src/notes.ts";

test("renderNote emits exact markdown with frontmatter and section order", () => {
  const note = renderNote({
    title: 'Project "Launch"',
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-17",
    summary: "Keep scope small.",
    decisions: ["Ship first"],
    actionItems: ["Draft plan"],
    openQuestions: ["What about updates?"],
    sourceUrl: "https://example.test/share/abc",
  });

  assert.equal(
    note,
    [
      "---",
      'title: "Project \\"Launch\\""',
      'codex_key: "abc-123"',
      'created: "2026-08-16"',
      'updated: "2026-08-17"',
      'source_url: "https://example.test/share/abc"',
      "---",
      "# Summary",
      "Keep scope small.",
      "",
      "## Decisions",
      "- Ship first",
      "",
      "## Action items",
      "- Draft plan",
      "",
      "## Open questions",
      "- What about updates?",
      "",
      "## Source conversation",
      "[Open the original Codex conversation](https://example.test/share/abc)",
    ].join("\n"),
  );
});

test("renderNote uses an unavailable source placeholder", () => {
  const note = renderNote({
    title: "Project planning",
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-16",
    summary: "Summary.",
    decisions: [],
    actionItems: [],
    openQuestions: [],
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
      "# Summary",
      "Summary.",
      "",
      "## Decisions",
      "None",
      "",
      "## Action items",
      "None",
      "",
      "## Open questions",
      "None",
      "",
      "## Source conversation",
      "Source conversation: unavailable",
    ].join("\n"),
  );
});

test("renderNote treats whitespace sourceUrl as unavailable and omits frontmatter", () => {
  const note = renderNote({
    title: "Project planning",
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-16",
    summary: "Summary.",
    decisions: [],
    actionItems: [],
    openQuestions: [],
    sourceUrl: "   ",
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
      "# Summary",
      "Summary.",
      "",
      "## Decisions",
      "None",
      "",
      "## Action items",
      "None",
      "",
      "## Open questions",
      "None",
      "",
      "## Source conversation",
      "Source conversation: unavailable",
    ].join("\n"),
  );
});

test("renderNote escapes YAML and Markdown link values", () => {
  const note = renderNote({
    title: 'Project: "Launch" / phase (1)',
    codexKey: "abc-123",
    created: "2026-08-16",
    updated: "2026-08-16",
    summary: "Summary.",
    decisions: [],
    actionItems: [],
    openQuestions: [],
    sourceUrl: "https://example.test/share/a(b)c?x=1&y=2",
  });

  assert.equal(
    note,
    [
      "---",
      'title: "Project: \\"Launch\\" / phase (1)"',
      'codex_key: "abc-123"',
      'created: "2026-08-16"',
      'updated: "2026-08-16"',
      'source_url: "https://example.test/share/a(b)c?x=1&y=2"',
      "---",
      "# Summary",
      "Summary.",
      "",
      "## Decisions",
      "None",
      "",
      "## Action items",
      "None",
      "",
      "## Open questions",
      "None",
      "",
      "## Source conversation",
      "[Open the original Codex conversation](https://example.test/share/a\\(b\\)c?x=1&y=2)",
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
