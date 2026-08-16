# First-Run Vault Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time Obsidian vault setup flow that asks for an existing vault or creates `Documents/Codex Obsidian`, then persists the choice for future saves.

**Architecture:** Extend the existing local MCP server with setup state and a `setup_vault` tool.
The save skill calls `get_status` first, asks the user only when setup is required, and then calls `setup_vault` before note matching or writing.
The existing direct Markdown write path, path containment, confirmation, and permission behavior remain unchanged.

**Tech Stack:** TypeScript, Node.js `fs/promises`, MCP stdio JSON-RPC runtime, Node test runner, PowerShell marketplace packaging.

## Global Constraints

- Use `Documents/Codex Obsidian` as the default new-vault location.
- Create `.obsidian` and `Codex/Conversations` for a new or selected vault.
- Treat an existing configuration file as completed setup and never prompt again.
- Accept only absolute custom vault paths.
- Stop on `permission denied`; do not retry or use Computer Use.
- Preserve all existing note formatting and path-containment guarantees.
- Keep the dependency-free `standalone.js` runtime synchronized with the SDK-backed development server contract.

---

### Task 1: Add persisted setup state and vault initialization

**Files:**
- Modify: `mcp-server/src/config.ts`
- Test: `mcp-server/test/paths.test.ts`

**Interfaces:**
- Produces `VaultConfig.setupRequired?: boolean` for an absent config file.
- Produces `DEFAULT_VAULT_NAME = "Codex Obsidian"`.
- Produces `ensureVaultRoot(config: VaultConfig): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add tests that assert an absent config returns the default root with `setupRequired: true`, an existing config returns `setupRequired: false`, and `ensureVaultRoot` creates `<vaultRoot>/.obsidian`.

```ts
assert.equal(config.vaultRoot, path.resolve(os.homedir(), "Documents", "Codex Obsidian"));
assert.equal(config.setupRequired, true);
await ensureVaultRoot({ vaultRoot, relativeSubfolder: DEFAULT_SUBFOLDER });
await assert.doesNotReject(() => access(path.join(vaultRoot, ".obsidian")));
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run from `mcp-server`:

```powershell
node --import tsx/esm --test test/paths.test.ts
```

Expected: FAIL because `setupRequired` and `ensureVaultRoot` are not implemented.

- [ ] **Step 3: Implement the minimal configuration behavior**

In `config.ts`, return the default vault root when the config file is absent, set `setupRequired: true` only for that fallback, set it to `false` for a parsed config or explicit `CODEX_OBSIDIAN_VAULT`, and implement:

```ts
export async function ensureVaultRoot(config: VaultConfig): Promise<void> {
  await mkdir(path.join(path.resolve(config.vaultRoot), ".obsidian"), { recursive: true });
}
```

Do not change malformed-config behavior or the existing relative-subfolder default.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same command and confirm all path/config tests pass.

- [ ] **Step 5: Commit the configuration change**

```powershell
git add mcp-server/src/config.ts mcp-server/test/paths.test.ts
git commit -m "feat: add first-run vault configuration state"
```

### Task 2: Add the `setup_vault` MCP tool and setup-aware status

**Files:**
- Modify: `mcp-server/src/server.ts`
- Modify: `mcp-server/src/standalone.ts`
- Test: `mcp-server/test/task5.test.ts`
- Test: `mcp-server/test/standalone.test.ts`

**Interfaces:**
- `get_status` returns `{ status: "setup_required", vaultRoot, relativeSubfolder }` when setup is absent.
- `setup_vault` accepts `{ vaultRoot?: string }` and returns `{ status: "configured", vaultRoot, relativeSubfolder }`.
- `setup_vault` persists the config with `saveConfig`, calls `ensureVaultRoot`, and creates the configured note folder through the existing write-safe path.

- [ ] **Step 1: Write failing MCP contract tests**

Add an SDK-backed test that uses an isolated config home, calls `get_status`, expects `setup_required`, calls `setup_vault` with no path, verifies the default root and config file, then calls `get_status` again and expects `ready`.
Add a standalone test that asserts `tools/list` includes `setup_vault` and that `tools/call` accepts the optional `vaultRoot` field.

```ts
assert.deepEqual(status.structuredContent, {
  status: "setup_required",
  vaultRoot: path.resolve(os.homedir(), "Documents", "Codex Obsidian"),
  relativeSubfolder: "Codex/Conversations",
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
node --import tsx/esm --test test/task5.test.ts test/standalone.test.ts
```

Expected: FAIL because the new tool and setup status do not exist.

- [ ] **Step 3: Implement the SDK-backed tool contract**

Add `setup_vault` to `server.ts` with an optional absolute `vaultRoot` string.
Use the default root when omitted, reject relative paths with `required or invalid input`, call `saveConfig`, call `ensureVaultRoot`, and return the configured path without exposing unrelated filesystem details.
Update the status schema to include `setup_required` and `vaultRoot`.
Call `ensureVaultRoot` before status or note operations only when setup is complete.

- [ ] **Step 4: Implement the same contract in `standalone.ts`**

Add the same tool definition, status result, absolute-path validation, config persistence, vault marker creation, and redacted error behavior to the dependency-free runtime.
Keep tool names, field names, and structured result shapes byte-for-byte compatible with `server.ts`.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run the same focused command and confirm the setup lifecycle and tool discovery tests pass.

- [ ] **Step 6: Commit the MCP change**

```powershell
git add mcp-server/src/server.ts mcp-server/src/standalone.ts mcp-server/test/task5.test.ts mcp-server/test/standalone.test.ts
git commit -m "feat: add first-run vault setup tool"
```

### Task 3: Update the save skill and packaged marketplace snapshot

**Files:**
- Modify: `skills/save-conversation/SKILL.md`
- Modify: `README.md`
- Modify: `local-marketplace/plugins/codex-to-obsidian/skills/save-conversation/SKILL.md`
- Modify: `local-marketplace/plugins/codex-to-obsidian/README.md`
- Modify: `local-marketplace/plugins/codex-to-obsidian/.mcp.json`
- Generate: `mcp-server/dist/*.js`
- Generate: `local-marketplace/plugins/codex-to-obsidian/mcp-server/dist/*.js`
- Modify: `.codex-plugin/plugin.json`
- Modify: `local-marketplace/plugins/codex-to-obsidian/.codex-plugin/plugin.json`

**Interfaces:**
- The skill performs setup only when `get_status.status` is `setup_required`.
- The setup question accepts an existing path or a new-vault choice, with no path meaning `Documents/Codex Obsidian`.
- A configured vault skips the setup question on every later save.

- [ ] **Step 1: Update the skill workflow**

Add this sequence before note matching:

```text
Call get_status.
If status is setup_required, ask for an existing vault path or whether to create a new vault.
Call setup_vault with the supplied absolute path, or with no path for Documents/Codex Obsidian.
Continue only after setup_vault returns configured.
```

Keep the existing confirmation immediately before create/update writes.
Keep the permission rule: stop on `permission denied`, ask for Full Access or approval, and never retry.

- [ ] **Step 2: Update user documentation**

Document the one-time setup prompt, the default path, the `.obsidian` marker, and the fact that subsequent projects reuse the saved vault.

- [ ] **Step 3: Build and synchronize the package**

Run:

```powershell
npm run build
Get-ChildItem -LiteralPath .\mcp-server\dist -File | Copy-Item -Destination .\local-marketplace\plugins\codex-to-obsidian\mcp-server\dist -Force
py -3 C:\Users\arezk\.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py .
```

Copy the resulting plugin version into the marketplace snapshot manifest and verify both `.mcp.json` files point to `./mcp-server/dist/standalone.js`.

- [ ] **Step 4: Commit the skill and package update**

```powershell
git add skills/save-conversation/SKILL.md README.md local-marketplace .codex-plugin/plugin.json
git commit -m "feat: add one-time vault setup workflow"
```

### Task 4: Full verification and installation handoff

**Files:**
- Verify: `mcp-server/`
- Verify: `%APPDATA%\codex-to-obsidian\config.json`
- Verify: `C:\Users\arezk\Documents\Codex Obsidian\`

**Interfaces:**
- The installed plugin must expose `get_status`, `setup_vault`, `find_note`, `create_note`, `update_note`, and `open_note`.

- [ ] **Step 1: Run the complete test suite**

Run from `mcp-server`:

```powershell
npm run build
npm test
```

Expected: build succeeds and all tests pass.

- [ ] **Step 2: Run a disposable setup lifecycle smoke test**

Start the packaged standalone runtime with an isolated config home and send `get_status`, `setup_vault`, `get_status`, and `create_note` requests.
Verify the new vault marker, persisted config, and formatted Markdown note.

- [ ] **Step 3: Refresh the installed local plugin**

Run:

```powershell
codex plugin add codex-to-obsidian@local-codex
```

Verify the installed cache version matches the marketplace manifest and the installed runtime has no `node_modules` dependency.

- [ ] **Step 4: Run the final direct installed-runtime smoke test**

Call `tools/list`, `get_status`, and `find_note` through the installed `standalone.js`.
Confirm an existing configured vault returns `ready` and does not require setup again.

- [ ] **Step 5: Commit verification notes**

```powershell
git diff --check
git status --short
```

Record the test count, installed version, and any manual Obsidian UI step in the existing Task 7 report.
