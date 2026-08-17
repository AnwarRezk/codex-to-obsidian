---
name: save-to-obsidian
description: Use when Codex desktop is asked to save, record, or convert the conversation into a detailed Obsidian Markdown note.
---

# Save To Obsidian

## Overview

Use this only for Obsidian note writes from Codex desktop.
The note is a detailed digest, not a transcript.
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

1. Trigger when the user asks to save, record, or convert the conversation into a detailed Obsidian Markdown note.
2. Call `get_status` before doing any note lookup.
3. If the result is `setup_required`, ask once: `Which Obsidian vault should I use? Provide an existing absolute folder path, or say create a new vault.`
4. If the user provides an existing absolute folder path, call `setup_vault` with that `vaultRoot`.
5. If the user says create a new vault or provides no path, call `setup_vault` without `vaultRoot`; this creates `Documents/Codex Obsidian`.
6. Call `get_status` again after setup and continue only when it returns `ready`.
7. Do not ask for the vault again after setup is `ready`; reuse the persisted configuration for later saves in every project.
8. Ask only when vault setup is missing or matching notes are ambiguous.
9. Generate one short filesystem-safe title, and preserve that title and relative path on updates.
10. Write one confirmed Markdown `body` string.
11. Include chronology, context, technical details, files and commands, failures and resolutions, decisions, constraints, and next steps in the digest.
12. Organize the content so the note reads like a useful technical handoff rather than a raw transcript.
13. Do not reproduce the conversation line by line.
14. Ask for confirmation immediately before any create or update write, and include the target path and operation.
15. Pass the MCP write schema: `title`, `codex_key`, `relativePath`, `created`, `updated`, and `body`.
16. Use `find_note`, `create_note`, `update_note`, and `get_status` as needed.
17. Use `open_note` only to obtain a validated Obsidian URI, and never claim that it opened the app.
18. If setup or a write returns `permission denied`, stop retrying and ask the user to rerun with Full Access or approve the configured vault path.
19. Never fall back to Computer Use or direct built-in filesystem writes for this workflow.

## Example

User: Save this conversation to Obsidian as a detailed note.
You: I will turn it into a detailed Markdown note in `Codex/Conversations/` and confirm the target path before writing.

## Common Mistakes

- Copying the raw transcript into the note.
- Leaving out chronology, concrete commands, or failure and resolution details.
- Changing the title or path during an update.
- Writing before confirmation.
- Asking for the vault again after setup has already completed.
- Claiming Obsidian opened after receiving only a URI.
