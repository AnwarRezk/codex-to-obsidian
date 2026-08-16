# Task 3 Report

Files changed.

- `mcp-server/src/notes.ts`.
- `mcp-server/test/notes.test.ts`.
- `.superpowers/sdd/2026-08-16-codex-to-obsidian/progress.md`.

Implementation summary.

- Added `NoteFrontmatter`, `NoteDraft`, `renderNote()`, `buildFilename()`, and `selectOperation()`.
- Rendered YAML frontmatter first, kept the section order fixed, made the source conversation section last, and used an unavailable fallback when no source URL is present.
- Sanitized filenames into `YYYY-MM-DD - title.md` and rejected unknown operations instead of silently remapping them.
- Escaped YAML strings and Markdown link targets with small local helpers.

Exact commands run and outputs.

```powershell
npm test -- --test-name-pattern="source|frontmatter|filename|operation|title"
```

Output.

```text
> codex-to-obsidian-mcp-server@0.1.0 test
> tsx --test test/**/*.test.ts --test-name-pattern=source|frontmatter|filename|operation|title

'tsx' is not recognized as an internal or external command,
operable program or batch file.
```

```powershell
node --experimental-strip-types --input-type=module -e 'import assert from "node:assert/strict"; import { buildFilename, renderNote, selectOperation } from "./src/notes.ts"; const amp = String.fromCharCode(38); const source = `https://example.test/share/a(b)c?x=1${amp}y=2`; const exact = renderNote({ title: "Project \\"Launch\\"", codexKey: "abc-123", created: "2026-08-16", updated: "2026-08-17", summary: "Keep scope small.", decisions: ["Ship first"], actionItems: ["Draft plan"], openQuestions: ["What about updates?"], sourceUrl: "https://example.test/share/abc" }); assert.equal(exact, ["---", "title: \\"Project \\\\\\"Launch\\\\\\"\\"", "codex_key: \\"abc-123\\"", "created: \\"2026-08-16\\"", "updated: \\"2026-08-17\\"", "source_url: \\"https://example.test/share/abc\\"", "---", "# Summary", "Keep scope small.", "", "## Decisions", "- Ship first", "", "## Action items", "- Draft plan", "", "## Open questions", "- What about updates?", "", "## Source conversation", "[Open the original Codex conversation](https://example.test/share/abc)"].join("\\n")); const unavailable = renderNote({ title: "Project planning", codexKey: "abc-123", created: "2026-08-16", updated: "2026-08-16", summary: "Summary.", decisions: [], actionItems: [], openQuestions: [] }); assert.equal(unavailable, ["---", "title: \\"Project planning\\"", "codex_key: \\"abc-123\\"", "created: \\"2026-08-16\\"", "updated: \\"2026-08-16\\"", "---", "# Summary", "Summary.", "", "## Decisions", "None", "", "## Action items", "None", "", "## Open questions", "None", "", "## Source conversation", "Source conversation: unavailable"].join("\\n")); const escaped = renderNote({ title: "Project: \\"Launch\\" / phase (1)", codexKey: "abc-123", created: "2026-08-16", updated: "2026-08-16", summary: "Summary.", decisions: [], actionItems: [], openQuestions: [], sourceUrl: source }); assert.equal(escaped, ["---", "title: \\"Project: \\\\\\"Launch\\\\\\" / phase (1)\\"", "codex_key: \\"abc-123\\"", "created: \\"2026-08-16\\"", "updated: \\"2026-08-16\\"", `source_url: ${JSON.stringify(source)}`, "---", "# Summary", "Summary.", "", "## Decisions", "None", "", "## Action items", "None", "", "## Open questions", "None", "", "## Source conversation", `[Open the original Codex conversation](https://example.test/share/a\\\\(b\\\\)c?x=1${amp}y=2)`].join("\\n")); assert.equal(buildFilename("2026-08-16T13:37:00Z", "Project: planning / launch? *draft*"), "2026-08-16 - Project planning launch draft.md"); assert.equal(buildFilename("2026-08-16", "Weekly sync"), "2026-08-16 - Weekly sync.md"); assert.equal(buildFilename("2026-08-16T23:59:59Z", "Weekly sync"), "2026-08-16 - Weekly sync.md"); assert.equal(selectOperation({ operation: "save", matchingNoteExists: true }), "create"); assert.equal(selectOperation({ operation: "update", matchingNoteExists: false }), "update"); assert.equal(selectOperation({ matchingNoteExists: true }), "update"); assert.equal(selectOperation({ matchingNoteExists: false }), "create"); assert.throws(() => selectOperation({ operation: "overwrite", matchingNoteExists: true }), /unknown operation/i); console.log("Task 3 smoke check passed");'
```

Output.

```text
Task 3 smoke check passed
```

```powershell
npm run build
```

Output.

```text
> codex-to-obsidian-mcp-server@0.1.0 build
> tsc -p tsconfig.json

'tsc' is not recognized as an internal or external command,
operable command or batch file.
```

Spec compliance verdict.

- Pass for the requested note rendering and operation policy scope.
- Exact Markdown output is pinned in tests.
- Source conversation is last and falls back to `Source conversation: unavailable`.
- Stable filename generation and explicit operation selection behave as requested.

Limitations.

- The local workspace does not have `tsx` or `tsc` installed, so the package scripts could not run here.
- I verified the note logic with a single-process Node smoke check instead.
