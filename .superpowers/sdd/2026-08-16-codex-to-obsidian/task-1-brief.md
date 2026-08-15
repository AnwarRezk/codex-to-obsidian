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
  "mcp_servers": {
    "codex-to-obsidian": {
      "command": "node",
      "args": ["./mcp-server/dist/server.js"]
    }
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

## Binding global constraints

- Version one targets Codex desktop only.
- No hosted service, cloud storage, telemetry, Canvas support, or Obsidian community plugin is included in version one.
- Preserve the exact plugin name `codex-to-obsidian` and version `0.1.0`.
- Keep generated build output and dependencies out of Git.
