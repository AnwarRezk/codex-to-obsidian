# Note Workflow Separation Design

## Status

Approved by the user on 2026-08-17.

## Problem

The current `save-conversation` skill combines conversation synthesis, note structure, and local Obsidian persistence.

Its fixed short-summary fields produce notes that are too brief to be useful after the conversation ends.

The renderer also emits a `Source conversation` section and an `unavailable` placeholder when no source URL exists.

The README explains the project mainly from a Windows and development perspective instead of giving platform-specific setup instructions for all supported desktop platforms.

## Goals

1. Separate summary generation from detailed conversation capture.
2. Expose two clear user-facing skills named `summarize-to-obsidian` and `save-to-obsidian`.
3. Support rich Markdown bodies without forcing the MCP server to understand content categories.
4. Remove the source conversation field and section entirely.
5. Provide organized Windows, macOS, and Linux setup documentation.
6. Preserve existing vault setup, safe path handling, create, update, and permission behavior.

## Non-goals

- Do not add cloud synchronization or a hosted MCP service.
- Do not create a verbatim transcript workflow.
- Do not add full-vault search, deletion, or Canvas support.
- Do not change the existing vault location or first-run setup contract.
- Do not use Computer Use or Obsidian UI automation for writes.

## User-facing skills

### `summarize-to-obsidian`

This skill creates a rich structured summary and saves it to the configured Obsidian vault.

The generated note should normally contain these sections:

1. `# Summary`
2. `## Context`
3. `## Key points`
4. `## Decisions`
5. `## Action items`
6. `## Open questions`
7. `## Next steps`

The summary should explain the purpose of the conversation, preserve important reasoning, identify concrete decisions, and record follow-up work.

It should be substantially more useful than a few short bullets while remaining a summary rather than a transcript.

### `save-to-obsidian`

This skill creates a detailed Markdown digest and saves it to the configured Obsidian vault.

The detailed note should capture the conversation's chronology, important technical details, files and commands discussed, problems and resolutions, decisions, constraints, and follow-up work.

It should use clear Markdown headings and lists, but it should not reproduce the entire raw transcript.

The skill should reuse the existing setup, lookup, confirmation, create, update, and permission workflow.

### Shared workflow rules

Both skills must call `get_status` before note lookup.

Both skills must perform first-run vault setup only once and reuse the persisted vault configuration thereafter.

Both skills must confirm the target path and operation immediately before creating or updating a note.

Both skills must write through the local MCP server and must stop on permission errors without retrying or falling back to Computer Use.

The two skills may use different content instructions, but they must share the same note persistence contract.

## MCP and renderer design

The MCP write payload will become content-agnostic.

It will retain `title`, `codex_key`, `relativePath`, `created`, and `updated` metadata fields.

It will replace the fixed `summary`, `decisions`, `actionItems`, and `openQuestions` fields with a required Markdown `body` field.

The renderer will produce frontmatter containing only `title`, `codex_key`, `created`, and `updated`.

The renderer will append the supplied Markdown body after the frontmatter without adding a source section.

The server will continue to validate the metadata, configured vault containment, and filesystem operations.

The server will not interpret or rewrite the semantic sections inside the Markdown body.

The `sourceUrl` field will be removed from the TypeScript types, Zod schemas, server conversion logic, renderer, skill instructions, tests, and documentation.

## Note lifecycle

The existing operation rules remain unchanged.

- An explicit `save` creates a new note.
- An explicit `update` updates the matching note after confirmation.
- Without an explicit operation, an existing matching note is updated and a missing matching note is created.
- Titles and relative paths remain stable during updates.

## README design

The README will be reorganized around the user journey.

1. Product overview and limitations.
2. Installation from the Codex app using the GitHub marketplace.
3. First-run Obsidian vault setup.
4. Platform requirements for Windows, macOS, and Linux.
5. Permission behavior and Full Access guidance.
6. Usage examples for both skills.
7. Configuration locations by platform.
8. Troubleshooting.
9. Local development and validation.
10. Privacy and security notes.

The public installation path will use the repository root marketplace manifest.

Platform-specific paths will use the correct environment-variable and application-support conventions for each operating system.

The README will clearly state that each teammate writes to their own local vault and that the plugin is not an official OpenAI or Obsidian product.

## Testing strategy

Add or update tests before implementation for the following behaviors:

- The renderer accepts and preserves a rich Markdown body.
- Frontmatter excludes `source_url`.
- The rendered note contains no `Source conversation` heading or unavailable placeholder.
- The renderer preserves Markdown headings, lists, code spans, and multiline content.
- The MCP standalone tool schema exposes the new body-based write contract.
- Create and update operations continue to use the new body field.
- Setup, path containment, permission, and note lookup tests continue to pass.
- Both packaged skill copies contain the new skill names and instructions.

The implementation will run the MCP test suite, TypeScript build, `git diff --check`, and targeted package metadata checks.

## Packaging and rollout

The root development plugin and the nested public marketplace plugin will remain synchronized.

The old `save-conversation` skill directory will be replaced by the two new skill directories in both package copies.

The plugin cachebuster will be updated through the plugin-creator update helper.

The public GitHub repository will be updated after verification so teammates can refresh the marketplace and install the new workflows.

Existing installed copies will require a plugin refresh or reinstall and a new Codex conversation to load the renamed skills.
