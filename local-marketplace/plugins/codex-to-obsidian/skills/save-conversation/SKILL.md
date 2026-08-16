---
name: save-conversation
description: Use when Codex desktop is asked to save, update, record, or write a conversation summary to Obsidian.
---

# Save Conversation

## Overview

Use this only for Obsidian note writes from Codex desktop.
The note is a summary, not a transcript.
The default folder is `Codex/Conversations/`.

## Tool boundary

Write the note directly through the local `codex-to-obsidian` MCP server.
Never use Computer Use, Obsidian UI automation, or an Obsidian plugin to create or edit the file.
Do not open Obsidian to perform the write.
Use `get_status`, `setup_vault`, `find_note`, `create_note`, and `update_note` for vault I/O.
Use `open_note` only when the user asks for a link after the write; it returns a URI and does not perform the write.

## Quick Reference

| Situation | Operation |
| --- | --- |
| Explicit `save` | Create a new note and never overwrite. |
| Explicit `update` | Update the matching note after confirmation. |
| No explicit operation | Update when a match exists, otherwise create. |

## Workflow

1. Trigger only when the user explicitly asks to save, update, record, or make an Obsidian note.
2. Call `get_status` before doing any note lookup.
3. If the result is `setup_required`, ask once: `Which Obsidian vault should I use? Provide an existing absolute folder path, or say create a new vault.`
4. If the user provides an existing absolute folder path, call `setup_vault` with that `vaultRoot`.
5. If the user says create a new vault or provides no path, call `setup_vault` without `vaultRoot`; this creates `Documents/Codex Obsidian`.
6. Call `get_status` again after setup and continue only when it returns `ready`.
7. Do not ask for the vault again after setup is `ready`; reuse the persisted configuration for later saves in every project.
8. Ask only when vault setup is missing or matching notes are ambiguous.
9. Generate one short filesystem-safe title, and preserve that title and relative path on updates.
10. Write only these five sections in this order.
11. `# Summary`.
12. `## Decisions`.
13. `## Action items`.
14. `## Open questions`.
15. `## Source conversation`.
16. Include a real source URL only if Codex has one or the user confirms one.
17. Use `unavailable` when no real source URL exists.
18. Ask for confirmation immediately before any create or update write, and include the target path and operation.
19. Pass the MCP write schema: `title`, `codex_key`, `relativePath`, `created`, `updated`, `summary`, `decisions`, `actionItems`, `openQuestions`, and optional `sourceUrl`.
20. Use `find_note`, `create_note`, `update_note`, and `get_status` as needed.
21. Use `open_note` only to obtain a validated Obsidian URI, and never claim that it opened the app.
22. If setup or a write returns `permission denied`, stop retrying and ask the user to rerun with Full Access or approve the configured vault path.
23. Never fall back to Computer Use or direct built-in filesystem writes for this workflow.

## Example

User: Save this conversation to Obsidian.
You: I will summarize it into `Codex/Conversations/` and confirm the target path before writing.

## Common Mistakes

- Adding a full transcript or Canvas output.
- Reordering sections or adding extra sections.
- Changing the title or path during an update.
- Inventing a source link.
- Writing before confirmation.
- Asking for the vault again after setup has already completed.
- Claiming Obsidian opened after receiving only a URI.
