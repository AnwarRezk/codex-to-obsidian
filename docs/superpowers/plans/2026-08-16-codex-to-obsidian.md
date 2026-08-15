# Codex to Obsidian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Codex desktop plugin that summarizes the current conversation and safely creates or updates a Markdown note under `Codex/Conversations/` in a user-selected Obsidian vault.

**Architecture:** A Codex plugin packages one `save-conversation` skill and a bundled local MCP server. The skill creates the title and summary, interprets explicit `save` or `update` instructions, and asks for confirmation. The MCP server owns local vault configuration, constrained file operations, note identity, and Obsidian URI generation.

**Tech Stack:** Codex plugin manifest, Markdown skill, Node.js, TypeScript, `@modelcontextprotocol/sdk`, `zod`, Node `fs/promises`, Node `node:test`, and Obsidian URI links.

## Global Constraints

- Version one targets Codex desktop only.
- The default vault folder is `Codex/Conversations/`.
- Version one stores the summary only and does not export the full transcript.
- Default behavior is update when a matching note exists and create when it does not.
- Explicit `save` creates a new note and never overwrites an existing note.
- Explicit `update` updates a matching note after confirmation.
- The generated title is created once and reused for later updates.
- The source conversation section is the final section of the note.
- The plugin must never fabricate a share URL.
- The MCP server must reject absolute paths, path traversal, unrestricted vault browsing, deletion, and arbitrary shell execution.
- Raw conversation text, note content, secrets, and access tokens must not be written to logs.
- The implementation must use a disposable test vault before any personal vault is used.
- No hosted service, cloud storage, telemetry, Canvas support, or Obsidian community plugin is included in version one.

---

## File map

- Create: `.codex-plugin/plugin.json` - plugin identity and component references.
- Create: `.mcp.json` - local MCP process configuration.
- Create: `skills/save-conversation/SKILL.md` - conversation summarization and operation-selection workflow.
- Create: `mcp-server/package.json` - server scripts and runtime dependencies.
- Create: `mcp-server/tsconfig.json` - TypeScript compiler settings.
- Create: `mcp-server/src/config.ts` - local configuration file and environment override handling.
- Create: `mcp-server/src/paths.ts` - vault-relative path validation and resolution.
- Create: `mcp-server/src/notes.ts` - title, filename, frontmatter, and note rendering.
- Create: `mcp-server/src/vault.ts` - safe create, update, and narrow lookup operations.
- Create: `mcp-server/src/obsidian-uri.ts` - encoded Obsidian open-note URI generation.
- Create: `mcp-server/src/server.ts` - MCP tool registration and transport startup.
- Create: `mcp-server/test/paths.test.ts` - path-security tests.
- Create: `mcp-server/test/notes.test.ts` - note-rendering and operation-policy tests.
- Create: `mcp-server/test/vault.test.ts` - disposable-vault create and update tests.
- Create: `README.md` - installation, vault configuration, commands, privacy, and troubleshooting.
- Create: `.gitignore` - generated dependencies, build output, and local configuration exclusions.

### Task 1: Scaffold the plugin package

**Files:**
- Create: `.codex-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `.gitignore`

**Interfaces:**
- Produces a loadable Codex plugin manifest and a buildable local MCP server package.

- [ ] **Step 1: Create the minimal plugin manifest**

Use this manifest shape:

```json
{
  "name": "codex-to-obsidian",
  "version": "0.1.0",
  "description": "Save Codex conversation summaries as safe, updateable Markdown notes in Obsidian.",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

- [ ] **Step 2: Add the local MCP command configuration**

Configure the server to run the built file with Node:

```json
{
  "codex-to-obsidian": {
    "command": "node",
    "args": ["./mcp-server/dist/server.js"]
  }
}
```

- [ ] **Step 3: Add the Node package metadata**

Define `build`, `test`, and `dev` scripts and install only `@modelcontextprotocol/sdk`, `zod`, `typescript`, and `tsx`.

- [ ] **Step 4: Add strict TypeScript settings**

Compile `src/` to `dist/` as an ES module with strict checking and declarations disabled.

- [ ] **Step 5: Validate the package shape**

Run the plugin validator and TypeScript compiler.

Expected result: the manifest validates and the empty server package compiles once the entry file exists in Task 5.

### Task 2: Implement configuration and path safety

**Files:**
- Create: `mcp-server/src/config.ts`
- Create: `mcp-server/src/paths.ts`
- Create: `mcp-server/test/paths.test.ts`

**Interfaces:**
- Produces `VaultConfig`, `loadConfig()`, `saveConfig()`, `resolveVaultPath()`, and `DEFAULT_SUBFOLDER` for later tasks.

- [ ] **Step 1: Write failing path tests**

Cover a valid relative note path, an absolute path, `..` traversal, a path outside `Codex/Conversations/`, and a filename containing a null byte.

```ts
test("rejects traversal outside the configured folder", () => {
  assert.throws(
    () => resolveVaultPath("C:/vault", "Codex/Conversations/../Secrets.md"),
    /outside configured folder/
  );
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --test-name-pattern="traversal|absolute|configured folder"`

Expected: FAIL because the path module does not exist.

- [ ] **Step 3: Implement configuration loading**

Use `%APPDATA%/codex-to-obsidian/config.json` on Windows, `$XDG_CONFIG_HOME/codex-to-obsidian/config.json` on Linux, and `~/Library/Application Support/codex-to-obsidian/config.json` on macOS.

Support `CODEX_OBSIDIAN_VAULT` as an explicit environment override for testing.

Store only the vault root and configured relative subfolder.

Default the relative subfolder to `Codex/Conversations`.

- [ ] **Step 4: Implement path validation**

Normalize separators, reject absolute paths and traversal, resolve the candidate path against the vault root, and verify that the candidate remains under the configured subfolder.

Return a normalized vault-relative path and an absolute filesystem path.

- [ ] **Step 5: Run the focused tests and verify success**

Run: `npm test -- --test-name-pattern="traversal|absolute|configured folder"`

Expected: PASS with every unsafe path rejected.

### Task 3: Implement note rendering and operation policy

**Files:**
- Create: `mcp-server/src/notes.ts`
- Create: `mcp-server/test/notes.test.ts`

**Interfaces:**
- Consumes: `VaultConfig` and validated relative paths from Task 2.
- Produces: `NoteDraft`, `NoteFrontmatter`, `renderNote()`, `buildFilename()`, and `selectOperation()` for Tasks 4 and 5.

- [ ] **Step 1: Write failing rendering tests**

Cover frontmatter fields, the fixed section order, the source link as the final section, missing source URL behavior, and filesystem-safe title slugs.

```ts
test("places the source section last", () => {
  const note = renderNote({
    title: "Project planning",
    codexKey: "abc",
    summary: "Summary",
    decisions: [],
    actionItems: [],
    openQuestions: [],
    sourceUrl: "https://example.test/share/abc"
  });

  assert.ok(note.trimEnd().endsWith("[Open the original Codex conversation](https://example.test/share/abc)"));
  assert.ok(note.lastIndexOf("## Source conversation") > note.lastIndexOf("## Open questions"));
});
```

The implementation test should assert the exact Markdown output separately so link formatting cannot drift.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --test-name-pattern="source section|frontmatter|filename"`

Expected: FAIL because rendering functions do not exist.

- [ ] **Step 3: Implement the note model and renderer**

Define the note sections as summary, decisions, action items, open questions, and source conversation.

Write `Source conversation: unavailable` when `sourceUrl` is absent.

Escape YAML strings and Markdown link values sufficiently to prevent malformed frontmatter and links.

- [ ] **Step 4: Implement filename and operation selection**

Generate `YYYY-MM-DD - title.md` once for a new note.

Return `update` when no explicit operation is present and a match exists.

Return `create` for an explicit `save`.

Return `update` for an explicit `update`.

Return `create` when no match exists and no explicit operation is present.

Reject unknown operation words instead of silently changing behavior.

- [ ] **Step 5: Run the focused tests and verify success**

Run: `npm test -- --test-name-pattern="source section|frontmatter|filename|operation"`

Expected: PASS with stable title and filename behavior.

### Task 4: Implement safe vault operations

**Files:**
- Create: `mcp-server/src/vault.ts`
- Create: `mcp-server/test/vault.test.ts`

**Interfaces:**
- Consumes: `VaultConfig`, `resolveVaultPath()`, `NoteDraft`, and `renderNote()`.
- Produces: `findNote()`, `createNote()`, and `updateNote()` for MCP tools.

- [ ] **Step 1: Write failing disposable-vault tests**

Cover creating a note, refusing an existing target, finding by `codex_key`, updating only a matching note, and refusing an update when the key does not match.

```ts
test("create refuses to overwrite an existing note", async () => {
  await createNote(config, draft);
  await assert.rejects(() => createNote(config, draft), /already exists/);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --test-name-pattern="create|find|update"`

Expected: FAIL because vault operations do not exist.

- [ ] **Step 3: Implement narrow lookup**

Search only the configured `Codex/Conversations` folder for Markdown files when looking up a `codex_key`.

Do not recursively inspect the rest of the vault.

Return zero, one, or multiple relative matches so the caller can handle ambiguity.

- [ ] **Step 4: Implement atomic create**

Create parent directories under the approved folder.

Use an exclusive file-create operation so an existing note cannot be overwritten.

Return the relative path, absolute path, and `codex_key`.

- [ ] **Step 5: Implement guarded update**

Read the target, parse its frontmatter enough to verify `codex_key`, render the replacement note, write a temporary file beside the target, and replace the target only after the temporary write succeeds.

Preserve the original `created` value and update only the `updated` value.

- [ ] **Step 6: Run the focused tests and verify success**

Run: `npm test -- --test-name-pattern="create|find|update"`

Expected: PASS with no overwrite and no mismatched-key update.

### Task 5: Implement Obsidian URI generation and MCP tools

**Files:**
- Create: `mcp-server/src/obsidian-uri.ts`
- Create: `mcp-server/src/server.ts`

**Interfaces:**
- Consumes: configuration, path, note, and vault modules from Tasks 2 through 4.
- Produces: MCP tools named `get_status`, `find_note`, `create_note`, `update_note`, and `open_note`.

- [ ] **Step 1: Write the URI unit test**

Verify that vault and file values are URI encoded and that the output uses the `obsidian://open` scheme.

- [ ] **Step 2: Implement URI generation**

Generate an `obsidian://open` URI with URI-encoded `vault` and `file` query parameters.

Use the vault directory name as the vault name and never include an absolute filesystem path in the returned URI.

- [ ] **Step 3: Register read-only tools**

Register `get_status` and `find_note` with read-only annotations.

Return concise structured results containing only configuration status, relative paths, and match counts.

- [ ] **Step 4: Register write tools**

Register `create_note` and `update_note` with write annotations and `destructiveHint: false`.

Require explicit note content, title, `codex_key`, and relative path inputs.

Reject missing or unsafe values server-side.

- [ ] **Step 5: Register the open-note tool**

Return the generated Obsidian URI and the relative note path.

Do not claim that Obsidian opened unless a real launch operation was performed successfully.

- [ ] **Step 6: Start the MCP transport**

Use the supported local transport from the MCP SDK and keep standard input and output free of diagnostic logging.

Send diagnostics to a redacted file logger only when explicitly enabled for development.

- [ ] **Step 7: Run the server type check and tool smoke test**

Run: `npm run build`

Run: `npm test`

Expected: the server compiles and all unit tests pass.

### Task 6: Add the Codex skill and user documentation

**Files:**
- Create: `skills/save-conversation/SKILL.md`
- Create: `README.md`

**Interfaces:**
- Consumes: MCP tools from Task 5.
- Produces: the user-facing workflow and installation instructions.

- [ ] **Step 1: Write the skill instructions**

The skill must instruct Codex to:

- Trigger only when the user asks to save, update, or record the conversation in Obsidian.
- Generate a short filesystem-safe title once.
- Produce summary-only Markdown with the agreed section order.
- Preserve the existing title and path during updates.
- Interpret explicit `save` and `update` instructions.
- Default to update when a match exists.
- Ask for confirmation before any create or update write.
- Pass only the explicit rendered note content to the MCP server.
- Include a real source URL only when Codex supplies or the user confirms it.
- Report exact paths and failures.

- [ ] **Step 2: Add README setup instructions**

Document plugin installation, local MCP setup, vault configuration, default path, supported prompts, update and save behavior, privacy boundaries, share-link behavior, and troubleshooting.

Include examples for:

```text
Save this conversation to Obsidian.
Update the existing Obsidian note with the latest decisions.
Save a new Obsidian note for this discussion.
```

- [ ] **Step 3: Add public-distribution guidance**

Document that the plugin is not an official OpenAI or Obsidian product and that public share links can expose conversation content.

- [ ] **Step 4: Run the plugin validator**

Run the plugin validation command against the project root.

Expected: manifest, skill, and MCP references pass validation.

### Task 7: Perform end-to-end verification and package the first release

**Files:**
- Modify: `README.md` if verification exposes setup or behavior gaps.
- Modify: `mcp-server/src/*.ts` only for verified defects.

**Interfaces:**
- Consumes: the complete plugin from Tasks 1 through 6.
- Produces: a validated local release candidate.

- [ ] **Step 1: Create a disposable test vault**

Create a temporary vault with a `Codex/Conversations` folder and do not use the user’s personal vault.

- [ ] **Step 2: Configure the local server**

Use the configuration flow or `CODEX_OBSIDIAN_VAULT` to point at the disposable vault.

- [ ] **Step 3: Test first-note creation**

Save a short conversation and verify the generated filename, frontmatter, section order, and final source section.

- [ ] **Step 4: Test default update**

Run the workflow again with revised content and verify that the same file is updated without changing its title or creation date.

- [ ] **Step 5: Test explicit save**

Request a new save for the same topic and verify that a second file is created without overwriting the first.

- [ ] **Step 6: Test failure boundaries**

Verify missing vault, missing Obsidian, ambiguous identity, traversal, absolute paths, collisions, mismatched keys, missing source URLs, prompt-injection text, and sensitive content in logs.

- [ ] **Step 7: Run final checks**

Run: `npm test`

Run: `npm run build`

Run: the plugin validator.

Expected: all checks pass and the release candidate reports failures accurately.

- [ ] **Step 8: Package without committing**

Because the current workspace is projectless and has no Git repository, preserve the source under `work/codex-to-obsidian` and place only the validated distributable archive or release files under `outputs`.

## Review checklist

### Spec coverage

- Desktop-first local architecture is covered by Tasks 1 and 5.
- `Codex/Conversations/` is covered by Tasks 2, 3, and 6.
- Automatic title generation is covered by Task 3.
- Default update and explicit save or update behavior is covered by Tasks 3 and 4.
- Summary-only note format is covered by Tasks 3 and 6.
- Final source-link placement and missing-link behavior are covered by Tasks 3 and 7.
- Path safety and no-overwrite behavior are covered by Tasks 2, 4, and 7.
- Privacy, logging, and share-link warnings are covered by Tasks 5, 6, and 7.
- Deferred Canvas, delete, cloud, and full-transcript scope is preserved by the global constraints.

### Placeholder scan

The plan contains no `TODO`, `TBD`, `FIXME`, or unspecified implementation steps.

### Type and interface consistency

Tasks 2 through 5 define the configuration, path, note, vault, URI, and MCP boundaries in dependency order.

The `codex_key`, relative path, note content, and source URL names remain consistent across the plan.
