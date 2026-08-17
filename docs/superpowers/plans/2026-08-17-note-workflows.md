# Separate Obsidian Note Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the short fixed-field conversation note flow with two named workflows that create richer Markdown notes, remove unavailable source metadata, and document setup for Windows, macOS, and Linux.

**Architecture:** The two Codex skills generate different Markdown bodies, while the local MCP server remains a content-agnostic vault writer.
The writer will validate note metadata and paths, prepend stable frontmatter, and persist the supplied body without adding semantic sections or source links.
The root development plugin and the nested public marketplace plugin will contain synchronized manifests, MCP code, tests, documentation, and skill copies.

**Tech Stack:** TypeScript, Node.js `node:test`, `tsx`, Zod, MCP SDK, Markdown, Codex plugin manifests, and PowerShell on Windows.

## Global Constraints

- Use the skill names `summarize-to-obsidian` and `save-to-obsidian`.
- `summarize-to-obsidian` creates a rich structured summary and saves it to Obsidian.
- `save-to-obsidian` creates a detailed Markdown digest rather than a verbatim transcript and saves it to Obsidian.
- The MCP write payload uses a required Markdown `body` field instead of `summary`, `decisions`, `actionItems`, and `openQuestions`.
- Frontmatter contains only `title`, `codex_key`, `created`, and `updated`.
- Remove `sourceUrl`, `source_url`, `## Source conversation`, and the `unavailable` placeholder.
- Preserve first-run vault setup, persisted vault selection, safe path containment, create/update semantics, confirmation requirements, and permission-denied stop behavior.
- Never use Computer Use, Obsidian UI automation, or direct fallback filesystem writes for note persistence.
- Keep the root development package and `local-marketplace/plugins/codex-to-obsidian` synchronized.
- Leave the unrelated untracked `NEXT-STEPS.md` file untouched.

---

## File Map

- Modify `mcp-server/src/notes.ts` to change the note draft contract and render arbitrary Markdown bodies without source metadata.
- Modify `mcp-server/src/server.ts` to expose the body-based MCP payload through the SDK-backed server.
- Modify `mcp-server/src/standalone.ts` to expose and validate the same body-based payload in the dependency-free runtime.
- Modify `mcp-server/test/notes.test.ts` for renderer behavior and source removal.
- Modify `mcp-server/test/vault.test.ts` for the new `NoteDraft` shape and persisted body behavior.
- Modify `mcp-server/test/standalone.test.ts` for tool discovery, body schema, and standalone create/update calls.
- Modify `mcp-server/test/task5.test.ts` for the SDK server's new write payload and source removal.
- Delete `skills/save-conversation/SKILL.md` and create `skills/summarize-to-obsidian/SKILL.md` and `skills/save-to-obsidian/SKILL.md`.
- Delete `local-marketplace/plugins/codex-to-obsidian/skills/save-conversation/SKILL.md` and create synchronized packaged skill copies.
- Rewrite `README.md` and `local-marketplace/plugins/codex-to-obsidian/README.md` with the cross-platform user journey.
- Modify `.codex-plugin/plugin.json` and `local-marketplace/plugins/codex-to-obsidian/.codex-plugin/plugin.json` only through the cachebuster helper after the implementation is complete.
- Refresh `local-marketplace/plugins/codex-to-obsidian/mcp-server/dist/` from the built source before packaging verification.

## Task 1: Change the renderer to accept rich Markdown bodies

**Files:**

- Modify: `mcp-server/test/notes.test.ts`
- Modify: `mcp-server/test/vault.test.ts`
- Modify: `mcp-server/src/notes.ts`

**Interfaces:**

- Consumes: `NoteDraft` currently containing fixed summary arrays and an optional source URL.
- Produces: `NoteDraft` containing `title`, `codexKey`, `created`, `updated`, and `body: string`.
- Produces: `renderNote(draft: NoteDraft): string` with frontmatter followed by the normalized body.

- [ ] **Step 1: Replace the renderer tests with a failing body-based test.**

Update `mcp-server/test/notes.test.ts` so the primary render test passes a body such as:

```ts
body: [
  "# Summary",
  "A detailed summary.",
  "",
  "## Decisions",
  "- Keep the local MCP boundary.",
].join("\\n"),
```

Assert that the output contains the body unchanged after frontmatter, contains no `source_url`, contains no `Source conversation`, and contains no `unavailable` text.

Add a multiline-body assertion containing headings, a list, inline code, and a fenced code block.

- [ ] **Step 2: Run the renderer tests and verify the expected failure.**

Run:

```powershell
Set-Location mcp-server
npm test -- --test-name-pattern="renderNote"
```

Expected result: the tests fail because `NoteDraft` still requires the fixed fields and `renderNote` still emits the source section.

- [ ] **Step 3: Implement the minimal renderer contract.**

In `mcp-server/src/notes.ts`:

1. Remove `sourceUrl` from `NoteFrontmatter`.
2. Replace the fixed summary fields in `NoteDraft` with `body: string`.
3. Remove `normalizeSourceUrl` and `escapeMarkdownLinkTarget`.
4. Keep title filename sanitization and date normalization unchanged.
5. Normalize CRLF to LF in `body`, trim only leading and trailing blank whitespace, and reject an empty body with `Error("Body is required")`.
6. Render frontmatter with only `title`, `codex_key`, `created`, and `updated`.
7. Append one blank line and the normalized body.

The resulting render shape must be equivalent to:

```ts
const lines = [
  "---",
  `title: ${yamlQuote(draft.title)}`,
  `codex_key: ${yamlQuote(draft.codexKey)}`,
  `created: ${yamlQuote(draft.created)}`,
  `updated: ${yamlQuote(draft.updated)}`,
  "---",
  "",
  ...normalizeBody(draft.body).split("\\n"),
];
```

- [ ] **Step 4: Update vault tests to use the new draft contract.**

Change `makeDraft` in `mcp-server/test/vault.test.ts` to provide a body containing the test sections instead of fixed arrays and remove all `sourceUrl` properties.

Keep the existing create, duplicate-create, find, update, path, and symlink assertions unchanged except where they compare the draft shape.

- [ ] **Step 5: Run the renderer and vault tests.**

Run:

```powershell
Set-Location mcp-server
npm test -- --test-name-pattern="renderNote|create writes|update|findNote|configured folder symlink"
```

Expected result: all selected tests pass and no rendered note contains source metadata.

- [ ] **Step 6: Commit the renderer contract.**

```powershell
Set-Location ..
git add mcp-server/src/notes.ts mcp-server/test/notes.test.ts mcp-server/test/vault.test.ts
git commit -m "refactor: render Obsidian notes from Markdown bodies"
```

## Task 2: Expose the body contract through both MCP runtimes

**Files:**

- Modify: `mcp-server/src/server.ts`
- Modify: `mcp-server/src/standalone.ts`
- Modify: `mcp-server/test/standalone.test.ts`
- Modify: `mcp-server/test/task5.test.ts`

**Interfaces:**

- Consumes: `NoteDraft.body` from Task 1.
- Produces: `create_note` and `update_note` payloads with required `body: string` and no source URL field.

- [ ] **Step 1: Change MCP tests first.**

In `mcp-server/test/standalone.test.ts` and `mcp-server/test/task5.test.ts`:

1. Replace every `summary`, `decisions`, `actionItems`, `openQuestions`, and `sourceUrl` payload field with one `body` string.
2. Assert that `tools/list` marks `body` as required for both write tools.
3. Assert that the serialized note has no `source_url` and no source section.
4. Keep the existing create, duplicate, find, update, unsafe-path, setup, and alias-root assertions.

- [ ] **Step 2: Run the MCP tests and verify the expected failure.**

Run:

```powershell
Set-Location mcp-server
npm test -- --test-name-pattern="standalone MCP|Task 5|create_note|update_note"
```

Expected result: tests fail because both runtime schemas still require the old fixed fields.

- [ ] **Step 3: Update the SDK-backed server.**

In `mcp-server/src/server.ts`:

1. Change `notePayloadSchema` to require `body: z.string().trim().min(1)`.
2. Remove `decisions`, `actionItems`, `openQuestions`, and `sourceUrl` from the schema.
3. Change `NotePayload` conversion so `toDraft` returns the new `body` property.
4. Leave vault loading, permission mapping, path validation, operation behavior, and output schemas unchanged.

- [ ] **Step 4: Update the dependency-free standalone server.**

In `mcp-server/src/standalone.ts`:

1. Change `NotePayload` to require `body: string` and remove all old content fields and `sourceUrl`.
2. Change `noteInputSchema()` to expose only the metadata fields plus required `body`.
3. Replace `asStringArray` usage in note payload validation with `asString(input.body)`.
4. Change `toDraft` to return `body`.
5. Preserve the existing generic error responses and filesystem safety behavior.

- [ ] **Step 5: Run the full MCP test suite and build.**

Run:

```powershell
Set-Location mcp-server
npm test
npm run build
```

Expected result: all tests pass and `dist/standalone.js` is regenerated successfully.

- [ ] **Step 6: Commit the MCP contract change.**

```powershell
Set-Location ..
git add mcp-server/src/server.ts mcp-server/src/standalone.ts mcp-server/test/standalone.test.ts mcp-server/test/task5.test.ts mcp-server/dist
git commit -m "feat: support rich Markdown note bodies"
```

## Task 3: Replace the single skill with the two named workflows

**Files:**

- Delete: `skills/save-conversation/SKILL.md`
- Create: `skills/summarize-to-obsidian/SKILL.md`
- Create: `skills/save-to-obsidian/SKILL.md`
- Delete: `local-marketplace/plugins/codex-to-obsidian/skills/save-conversation/SKILL.md`
- Create: `local-marketplace/plugins/codex-to-obsidian/skills/summarize-to-obsidian/SKILL.md`
- Create: `local-marketplace/plugins/codex-to-obsidian/skills/save-to-obsidian/SKILL.md`

**Interfaces:**

- Consumes: the shared MCP tools `get_status`, `setup_vault`, `find_note`, `create_note`, `update_note`, and optional `open_note`.
- Produces: a confirmed `body` string and the unchanged metadata fields for the MCP write tools.

- [ ] **Step 1: Create the failing packaging check.**

Add a small Node test at `mcp-server/test/skill-packaging.test.ts` that reads the root and packaged skill directories and asserts:

1. Both directories contain `summarize-to-obsidian/SKILL.md`.
2. Both directories contain `save-to-obsidian/SKILL.md`.
3. Neither directory contains `save-conversation/SKILL.md`.
4. Neither skill mentions `sourceUrl`, `source_url`, or `Source conversation`.

- [ ] **Step 2: Run the packaging test and verify the expected failure.**

Run:

```powershell
Set-Location mcp-server
npm test -- --test-name-pattern="skill packaging"
```

Expected result: the test fails because the old skill directory still exists.

- [ ] **Step 3: Write `summarize-to-obsidian/SKILL.md`.**

The skill must:

1. Trigger only when the user asks for a summary or asks to summarize the conversation to Obsidian.
2. Generate a rich structured body with `# Summary`, `## Context`, `## Key points`, `## Decisions`, `## Action items`, `## Open questions`, and `## Next steps`.
3. Preserve important reasoning and concrete outcomes instead of producing generic one-line bullets.
4. Follow the existing setup, confirmation, lookup, create/update, and permission rules.
5. Pass the body in the new MCP payload and never pass a source URL.

- [ ] **Step 4: Write `save-to-obsidian/SKILL.md`.**

The skill must:

1. Trigger when the user asks to save, record, or convert the conversation into a detailed Obsidian Markdown note.
2. Generate a detailed digest containing chronology, context, technical details, files and commands, failures and resolutions, decisions, constraints, and next steps.
3. Avoid reproducing the raw transcript.
4. Follow the existing setup, confirmation, lookup, create/update, and permission rules.
5. Pass the body in the new MCP payload and never pass a source URL.

- [ ] **Step 5: Mirror both skills into the public package.**

Copy the exact reviewed Markdown files into `local-marketplace/plugins/codex-to-obsidian/skills/` and remove the old packaged `save-conversation` directory.

- [ ] **Step 6: Run the packaging and full test suites.**

Run:

```powershell
Set-Location mcp-server
npm test
```

Expected result: the new skill packaging test and all existing MCP tests pass.

- [ ] **Step 7: Commit the skill split.**

```powershell
Set-Location ..
git add skills local-marketplace/plugins/codex-to-obsidian/skills mcp-server/test/skill-packaging.test.ts
git commit -m "feat: split Obsidian summary and save workflows"
```

## Task 4: Rewrite the cross-platform README

**Files:**

- Modify: `README.md`
- Modify: `local-marketplace/plugins/codex-to-obsidian/README.md`

**Interfaces:**

- Consumes: the final skill names, MCP body contract, marketplace root, setup behavior, and platform configuration rules from Tasks 1 through 3.
- Produces: synchronized user-facing documentation for installation and operation on Windows, macOS, and Linux.

- [ ] **Step 1: Replace the root README with the user journey.**

Organize the document in this order:

1. What the plugin does and does not do.
2. Install from the Codex app using `https://github.com/AnwarRezk/codex-to-obsidian`.
3. Install from the CLI for local development and public GitHub use.
4. Requirements, including Codex, Node.js, and a writable local vault.
5. First-run setup with existing-vault and create-vault paths.
6. Usage examples for `summarize-to-obsidian` and `save-to-obsidian`.
7. Platform configuration locations for Windows, macOS, and Linux.
8. Permissions and Full Access behavior.
9. Troubleshooting.
10. Development and validation commands.
11. Privacy, local-only behavior, and product-not-affiliated disclaimer.

- [ ] **Step 2: Mirror the README into the packaged plugin.**

Copy the reviewed root README to `local-marketplace/plugins/codex-to-obsidian/README.md` and ensure every command and path reflects the public package layout.

- [ ] **Step 3: Verify documentation references.**

Run:

```powershell
rg -n "save-conversation|sourceUrl|source_url|Source conversation|unavailable" README.md local-marketplace/plugins/codex-to-obsidian/README.md skills local-marketplace/plugins/codex-to-obsidian/skills
```

Expected result: no matches.

- [ ] **Step 4: Commit the documentation update.**

```powershell
git add README.md local-marketplace/plugins/codex-to-obsidian/README.md
git commit -m "docs: document cross-platform Obsidian workflows"
```

## Task 5: Synchronize, package, and verify the public plugin

**Files:**

- Modify: `.codex-plugin/plugin.json`
- Modify: `local-marketplace/plugins/codex-to-obsidian/.codex-plugin/plugin.json`
- Modify: `local-marketplace/plugins/codex-to-obsidian/mcp-server/dist/`
- Verify: `.agents/plugins/marketplace.json`

**Interfaces:**

- Consumes: the tested source implementation, skills, README, and root marketplace manifest.
- Produces: a public package that installs from the repository root and exposes both workflows.

- [ ] **Step 1: Build the source MCP server.**

Run:

```powershell
Set-Location mcp-server
npm test
npm run build
Set-Location ..
```

- [ ] **Step 2: Refresh the packaged runtime.**

Copy the generated `mcp-server/dist/*.js` files into `local-marketplace/plugins/codex-to-obsidian/mcp-server/dist/` without copying `node_modules` or development-only files.

- [ ] **Step 3: Check package synchronization.**

Compare the root and packaged copies of the plugin manifest, README, skill files, MCP source files, and generated runtime.

Run:

```powershell
git diff --no-index -- .codex-plugin/plugin.json local-marketplace/plugins/codex-to-obsidian/.codex-plugin/plugin.json
git diff --no-index -- README.md local-marketplace/plugins/codex-to-obsidian/README.md
```

Expected result: differences are limited to intentional package-relative metadata formatting.

- [ ] **Step 4: Update the plugin cachebuster.**

Run the plugin-creator cachebuster helper once for the root plugin and once for the packaged plugin, using one shared cachebuster value so both manifests identify the same release.

- [ ] **Step 5: Reinstall the local marketplace copy.**

Run:

```powershell
codex plugin add codex-to-obsidian@local-codex
```

Start a new Codex conversation after reinstalling.

- [ ] **Step 6: Run final static verification.**

Run:

```powershell
git diff --check HEAD~5..HEAD
git status --short
Get-Content -Raw '.agents/plugins/marketplace.json' | ConvertFrom-Json
Get-Content -Raw 'local-marketplace/plugins/codex-to-obsidian/.codex-plugin/plugin.json' | ConvertFrom-Json
```

Verify that only the intended plugin files are tracked and that `NEXT-STEPS.md` remains untracked and untouched.

- [ ] **Step 7: Commit the packaged release.**

```powershell
git add .codex-plugin local-marketplace/plugins/codex-to-obsidian/.codex-plugin local-marketplace/plugins/codex-to-obsidian/mcp-server/dist .agents/plugins/marketplace.json
git commit -m "chore: package separate Obsidian note workflows"
```

- [ ] **Step 8: Push the public update and verify GitHub.**

```powershell
git push origin main
```

Verify that the public repository root marketplace manifest, both skill directories, updated manifests, README, and compiled runtime are available on `main`.
