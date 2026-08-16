# SDD ledger - plan: C:/Users/arezk/Documents/Codex/2026-08-16/openai-s-current-harness-guidance-3/work/codex-to-obsidian/docs/superpowers/plans/2026-08-16-codex-to-obsidian.md

Execution started with native PowerShell because the Bash helper was denied on Windows.

Task 1: minor (deferred): the bundled validator requires PyYAML and an older `.mcp.json` wrapper schema; current official plugin docs support the committed direct server map. JSON parsing and diff checks passed.
Task 1: fix round 1/5 (addressed original wrapper-shape finding; local validator mismatch remained).
Task 1: fix round 2/5 (addressed by switching to the docs-supported direct server map; validator remained unavailable without PyYAML).
Task 1: fix round 3/5 (addressed inaccurate OpenAI attribution; scoped re-review passed).
Task 1: complete (commits 4b825dc..dec026f, implementation review accepted with deferred local-validator issue).
Task 2: fix round 1/5 (addressed test-runner wiring, env-root override subfolder preservation, and current-platform config-path coverage; commits 11108f1..e657c4a).
Task 2: fix round 2/5 (addressed malformed/unusable config behavior under explicit CODEX_OBSIDIAN_VAULT override; commit 13a0e7f).
Task 2: fix round 3/5 (removed redundant strict-path error wrapper; scoped re-review passed; commit f10a640).
Task 2: complete (commits 11108f1..f10a640, scoped review clean; package test/build remain unrun because local tsx/tsc are unavailable).
Task 3: fix round 1/5 (addressed reserved filenames, date-prefix stability, whitespace source URLs, and escaping-test mismatch; scoped re-review passed; commit db2695f).
Task 3: complete (commits 412333a..db2695f, note renderer and operation policy reviewed clean; package test/build remain unrun because local tsx/tsc are unavailable).
Task 2: complete (config and path safety implemented, with local smoke verification passed and package-local test/build tooling unavailable in this workspace).
Task 3: complete (note rendering and operation policy implemented; local smoke verification passed; package-local tsx/tsc remain unavailable in this workspace).
Task 4: complete (safe vault operations implemented; bounded Node smoke verification passed; package-local tsx/tsc remain unavailable in this workspace).
Task 4: fix round 1/5 (added realpath containment, multiple-match coverage, and symlink/junction regression; bounded Node smoke and diff checks passed; commit pending).
Task 4: fix round 2/5 (split logical and real lookup paths so configured-folder symlinks round-trip through find/update; bounded Node smoke and diff checks passed; commit pending).
Task 5: complete (Obsidian URI generation and MCP tool registration implemented; build and test passed; commit pending).
Task 5: fix round 1/5 (redacted errors, switched wire names to `codex_key`, tightened tool output contracts, pinned `@types/node`, and expanded RPC smoke coverage; build, test, and diff check passed; commit pending).
Task 5: fix round 2/5 (kept configured vault basenames for URI generation and added alias-root regression coverage; build, test, and diff check passed; commit pending).
Task 5: fix round 3/5 (returned alias-root lookup paths from the logical configured root while preserving realpath containment; build, test, and diff check passed; commit pending).
Task 6: complete (save-conversation skill and user docs added; `npm test`, `npm run build`, and `git diff --check` passed, and no practical bundled validator command was available in this workspace).
