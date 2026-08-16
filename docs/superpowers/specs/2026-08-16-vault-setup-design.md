# Codex to Obsidian first-run vault setup

## Goal

Ask for the Obsidian vault location once before the first save.

Use an existing user-provided folder when one is supplied.

When the user requests a new vault, default it to `Documents/Codex Obsidian`.

Reuse the persisted vault for all later saves and projects.

## User flow

The save skill calls `get_status` before note matching or writing.

If setup is already complete, the existing save and update workflow continues without a setup question.

If setup is required, the skill asks the user for an existing vault path or whether a new vault should be created.

The skill calls `setup_vault` only after the user answers.

An omitted or explicit new-vault choice uses the default `Documents/Codex Obsidian` location.

The setup operation creates the vault folder, its `.obsidian` marker, and the configured `Codex/Conversations` folder.

The setup operation persists the selected vault in the per-user configuration file.

## MCP contract

`get_status` returns `setup_required` with the default vault path when no configuration exists.

`get_status` returns `ready` with the configured vault path after setup.

`setup_vault` accepts an optional absolute `vaultRoot`.

`setup_vault` returns the selected vault root and configured relative subfolder.

The existing note tools continue to write only below the configured relative subfolder.

## Permissions

The MCP server reports filesystem access failures as `permission denied`.

The save skill stops retrying after that result.

The save skill asks the user to rerun with Full Access or approve the configured vault path.

The workflow never falls back to Computer Use or direct built-in filesystem writes.

## Compatibility

An existing configuration file counts as completed setup and does not prompt again.

The current configured `Codex Obsidian` vault remains valid.

Existing note formatting, path containment, confirmation, and create/update behavior remain unchanged.

## Verification

Add tests for missing-config setup status, default-vault setup, custom-vault setup, persisted configuration, and repeated status checks.

Run the full MCP build and test suite.

Run a direct MCP smoke test that performs setup, status, and note creation in a disposable location.
