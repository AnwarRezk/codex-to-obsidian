import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_SUBFOLDER,
  loadConfig,
  saveConfig,
  type VaultConfig,
} from "../src/config.js";
import { resolveVaultPath } from "../src/paths.js";

async function withEnv(
  patch: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withTempConfigHome(
  run: (configHome: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-obsidian-"));
  await run(root);
}

function getPlatformConfigPath(configHome: string): string {
  if (process.platform === "win32") {
    return path.join(configHome, "codex-to-obsidian", "config.json");
  }

  if (process.platform === "darwin") {
    return path.join(
      configHome,
      "Library",
      "Application Support",
      "codex-to-obsidian",
      "config.json",
    );
  }

  return path.join(configHome, "codex-to-obsidian", "config.json");
}

function getPlatformEnvPatch(
  configHome: string,
): Record<string, string | undefined> {
  if (process.platform === "win32") {
    return {
      APPDATA: path.join(configHome, "AppData", "Roaming"),
      XDG_CONFIG_HOME: undefined,
      HOME: undefined,
    };
  }

  if (process.platform === "darwin") {
    return {
      APPDATA: undefined,
      XDG_CONFIG_HOME: undefined,
      HOME: path.join(configHome, "home"),
    };
  }

  return {
    APPDATA: undefined,
    XDG_CONFIG_HOME: path.join(configHome, ".config"),
    HOME: undefined,
  };
}

test("valid relative note path resolves inside the configured folder", () => {
  const result = resolveVaultPath(
    {
      vaultRoot: "C:\\vault",
      relativeSubfolder: DEFAULT_SUBFOLDER,
    },
    "Codex\\Conversations\\Project Notes.md",
  );

  assert.equal(result.relativePath, "Codex/Conversations/Project Notes.md");
  assert.equal(
    result.absolutePath,
    path.resolve("C:\\vault", "Codex", "Conversations", "Project Notes.md"),
  );
});

test("absolute path is rejected", () => {
  assert.throws(
    () =>
      resolveVaultPath(
        {
          vaultRoot: "C:\\vault",
          relativeSubfolder: DEFAULT_SUBFOLDER,
        },
        "C:\\vault\\Codex\\Conversations\\Project Notes.md",
      ),
    /absolute/i,
  );
});

test("traversal outside the configured folder is rejected", () => {
  assert.throws(
    () =>
      resolveVaultPath(
        {
          vaultRoot: "C:\\vault",
          relativeSubfolder: DEFAULT_SUBFOLDER,
        },
        "Codex/Conversations/../Secrets.md",
      ),
    /(outside configured folder|traversal)/i,
  );
});

test("path outside the configured folder is rejected", () => {
  assert.throws(
    () =>
      resolveVaultPath(
        {
          vaultRoot: "C:\\vault",
          relativeSubfolder: DEFAULT_SUBFOLDER,
        },
        "Drafts/Project Notes.md",
      ),
    /outside configured folder/i,
  );
});

test("filename containing a null byte is rejected", () => {
  assert.throws(
    () =>
      resolveVaultPath(
        {
          vaultRoot: "C:\\vault",
          relativeSubfolder: DEFAULT_SUBFOLDER,
        },
        "Codex/Conversations/Project\0Notes.md",
      ),
    /null byte/i,
  );
});

test("default configured folder is Codex/Conversations", async () => {
  await withTempConfigHome(async (configHome) => {
    const envPatch = getPlatformEnvPatch(configHome);
    const configPath = getPlatformConfigPath(
      process.platform === "win32"
        ? envPatch.APPDATA ?? configHome
        : process.platform === "darwin"
          ? envPatch.HOME ?? configHome
          : envPatch.XDG_CONFIG_HOME ?? configHome,
    );

    await withEnv(
      { ...envPatch, CODEX_OBSIDIAN_VAULT: undefined },
      async () => {
        await mkdir(path.dirname(configPath), { recursive: true });
        await writeFile(
          configPath,
          JSON.stringify({ vaultRoot: "C:\\vault" }),
          "utf8",
        );

        const config = await loadConfig();

        assert.equal(config.vaultRoot, "C:\\vault");
        assert.equal(config.relativeSubfolder, DEFAULT_SUBFOLDER);
      },
    );
  });
});

test("environment override uses CODEX_OBSIDIAN_VAULT", async () => {
  await withTempConfigHome(async (configHome) => {
    const envPatch = getPlatformEnvPatch(configHome);

    await withEnv(
      { ...envPatch, CODEX_OBSIDIAN_VAULT: "C:\\temp-vault" },
      async () => {
        const config = await loadConfig();

        assert.equal(config.vaultRoot, "C:\\temp-vault");
        assert.equal(config.relativeSubfolder, DEFAULT_SUBFOLDER);
      },
    );
  });
});

test("environment override preserves a configured relative folder", async () => {
  await withTempConfigHome(async (configHome) => {
    const envPatch = getPlatformEnvPatch(configHome);
    const configPath = getPlatformConfigPath(
      process.platform === "win32"
        ? envPatch.APPDATA ?? configHome
        : process.platform === "darwin"
          ? envPatch.HOME ?? configHome
          : envPatch.XDG_CONFIG_HOME ?? configHome,
    );

    await withEnv(
      { ...envPatch, CODEX_OBSIDIAN_VAULT: "C:\\temp-vault" },
      async () => {
        await mkdir(path.dirname(configPath), { recursive: true });
        await writeFile(
          configPath,
          JSON.stringify({
            vaultRoot: "C:\\vault",
            relativeSubfolder: "Inbox\\Daily",
          }),
          "utf8",
        );

        const config = await loadConfig();

        assert.equal(config.vaultRoot, "C:\\temp-vault");
        assert.equal(config.relativeSubfolder, "Inbox/Daily");
      },
    );
  });
});

test("saveConfig persists the vault root and configured folder", async () => {
  await withTempConfigHome(async (configHome) => {
    const envPatch = getPlatformEnvPatch(configHome);
    const configPath = getPlatformConfigPath(
      process.platform === "win32"
        ? envPatch.APPDATA ?? configHome
        : process.platform === "darwin"
          ? envPatch.HOME ?? configHome
          : envPatch.XDG_CONFIG_HOME ?? configHome,
    );

    await withEnv(
      { ...envPatch, CODEX_OBSIDIAN_VAULT: undefined },
      async () => {
        const config: VaultConfig = {
          vaultRoot: "C:\\vault",
          relativeSubfolder: DEFAULT_SUBFOLDER,
        };

        await saveConfig(config);

        const fileContents = await readFile(configPath, "utf8");

        assert.deepEqual(JSON.parse(fileContents), config);
      },
    );
  });
});
