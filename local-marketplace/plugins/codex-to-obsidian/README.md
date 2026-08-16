# Codex to Obsidian

Codex to Obsidian is a Codex desktop-first plugin that turns the current conversation into a local Markdown note for an Obsidian vault.
It summarizes the conversation, keeps the source conversation section last, and writes under `Codex/Conversations/` by default.
It is not an official OpenAI product or an official Obsidian product.

## Repository Layout

- `.codex-plugin/plugin.json` declares the plugin.
- `.mcp.json` points Codex at the local MCP server.
- `skills/save-conversation/SKILL.md` guides the save and update workflow.
- `mcp-server/` contains the local MCP server source, build output, and tests.

## Installation

Install the plugin directory in Codex, or add the repository through a local marketplace entry that points at this plugin folder.
The plugin shape follows the official OpenAI plugin docs for `.mcp.json` integration.
See the official docs at [Plugins in ChatGPT and Codex](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex).

For local development, use the included `local-marketplace` folder.
In Codex, choose Plugins -> Add -> Add marketplace and select the `local-marketplace` folder.
Then install `codex-to-obsidian` from the marketplace and start a new Codex task before testing.
The equivalent CLI flow for this non-default local marketplace is:

```powershell
codex plugin marketplace add C:/path/to/codex-to-obsidian/local-marketplace
codex plugin add codex-to-obsidian@local-codex
```

## Local MCP Setup

Install Node.js before using the local server.
Run `npm install` from `mcp-server` to install the MCP SDK and TypeScript tooling.
Build the server with `npm run build` from `mcp-server`.
Codex starts the dependency-free runtime with `node ./mcp-server/dist/standalone.js`.
The built `mcp-server/dist/standalone.js` file must exist for the local MCP entry to work.

## Configuration

The normal configuration file is `config.json` in the plugin's per-user configuration directory.
On Windows, use `%APPDATA%\\codex-to-obsidian\\config.json`.
On macOS, use `~/Library/Application Support/codex-to-obsidian/config.json`.
On Linux, use `$XDG_CONFIG_HOME/codex-to-obsidian/config.json`, or `~/.config/codex-to-obsidian/config.json` when `XDG_CONFIG_HOME` is unset.
Create it with a vault root and, optionally, a relative subfolder:

```json
{
  "vaultRoot": "C:/Users/you/Documents/MyVault",
  "relativeSubfolder": "Codex/Conversations"
}
```

The default relative subfolder is `Codex/Conversations`.
When no configuration file exists, the plugin uses `~/Documents/Codex Obsidian` as the vault root.
On first use, `get_status` reports `setup_required` without creating anything.
The save skill asks for an existing absolute vault path or offers to create `Documents/Codex Obsidian`.
`setup_vault` then creates the vault folder, its `.obsidian` marker, and `Codex/Conversations/`, and persists the choice for later saves.
For local testing, set `CODEX_OBSIDIAN_VAULT` to a disposable vault root; this override uses the default subfolder when no usable config file is present.
Keep the vault writable and let the plugin create the configured subfolder when a write requires it.

## Behavior

The default folder is exactly `Codex/Conversations/`.
The note is summary only and uses this fixed section order.

1. `# Summary`.
2. `## Decisions`.
3. `## Action items`.
4. `## Open questions`.
5. `## Source conversation`.

The source conversation section is always last.
The title is generated once for a new note and preserved on updates.
If a matching note exists, the default operation is update.
If no matching note exists, the default operation is create.
An explicit `save` always creates a new note.
An explicit `update` always updates the matching note after confirmation.
The plugin asks for confirmation immediately before every create or update write.
The plugin passes the MCP write fields: title, `codex_key`, safe `relativePath`, creation and update timestamps, summary, decisions, action items, open questions, and an optional source URL.
The plugin includes a source URL only when Codex has a real URL or the user confirms one.
If no real source URL exists, the note says `unavailable` instead of inventing a link.

## Prompts

- `Save this conversation to Obsidian.`
- `Update the existing Obsidian note with the latest decisions.`
- `Save a new Obsidian note for this discussion.`
- `Record this conversation in Obsidian and keep the existing note updated.`

## Privacy

This plugin is local-only in version one.
It does not add cloud sync, telemetry, deletion, or full-vault search.
It does not export the full transcript.
It does not promise Canvas support.
The `open_note` tool returns a validated `obsidian://` URI; it does not launch Obsidian or confirm that the app opened.
Public share links can expose conversation content, so treat any confirmed source URL as sensitive.

## Troubleshooting

- If Node.js is missing, install it and rerun the build.
- If a write returns `permission denied`, stop retrying and rerun the Codex task with Full Access or approve the configured vault path.
- If setup is required, provide an existing absolute vault path or let `setup_vault` create `Documents/Codex Obsidian`.
- If the vault is missing, point `CODEX_OBSIDIAN_VAULT` at a real writable vault.
- If a path is unsafe, check that the target stays inside `Codex/Conversations/` and does not use absolute or traversal segments.
- If a note already exists for an explicit `save`, choose a different title or request a fresh save for a different conversation.
- If the local validator fails, note that the current validator has a known dependency and schema mismatch with the docs-backed `.mcp.json` shape, so do not treat that failure as a plugin regression until the validator is updated.

## Validation

Run `npm test` and `npm run build` from `mcp-server`.
Run `git diff --check` before committing.
If you try the bundled plugin validator, record the exact mismatch it reports instead of claiming success.
