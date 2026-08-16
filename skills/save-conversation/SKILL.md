---
name: save-conversation
description: Use when Codex desktop is asked to save, update, record, or write a conversation summary to Obsidian.
---

# Save Conversation

## Overview

Use this only for Obsidian note writes from Codex desktop.
The note is a summary, not a transcript.
The default folder is `Codex/Conversations/`.

## Quick Reference

| Situation | Operation |
| --- | --- |
| Explicit `save` | Create a new note and never overwrite. |
| Explicit `update` | Update the matching note after confirmation. |
| No explicit operation | Update when a match exists, otherwise create. |

## Workflow

1. Trigger only when the user explicitly asks to save, update, record, or make an Obsidian note.
2. Ask only when vault setup is missing or matching notes are ambiguous.
3. Generate one short filesystem-safe title, and preserve that title and relative path on updates.
4. Write only these five sections in this order.
5. `# Summary`.
6. `## Decisions`.
7. `## Action items`.
8. `## Open questions`.
9. `## Source conversation`.
10. Include a real source URL only if Codex has one or the user confirms one.
11. Use `unavailable` when no real source URL exists.
12. Ask for confirmation immediately before any create or update write, and include the target path and operation.
13. Pass the MCP write schema: `title`, `codex_key`, `relativePath`, `created`, `updated`, `summary`, `decisions`, `actionItems`, `openQuestions`, and optional `sourceUrl`.
14. Use `find_note`, `create_note`, `update_note`, and `get_status` as needed.
15. Use `open_note` only to obtain a validated Obsidian URI, and never claim that it opened the app.

## Example

User: Save this conversation to Obsidian.
You: I will summarize it into `Codex/Conversations/` and confirm the target path before writing.

## Common Mistakes

- Adding a full transcript or Canvas output.
- Reordering sections or adding extra sections.
- Changing the title or path during an update.
- Inventing a source link.
- Writing before confirmation.
- Claiming Obsidian opened after receiving only a URI.
