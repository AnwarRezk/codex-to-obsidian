import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_SUBFOLDER = "Codex/Conversations";
export const DEFAULT_VAULT_NAME = "Codex Obsidian";

export interface VaultConfig {
  vaultRoot: string;
  relativeSubfolder: string;
  setupRequired?: boolean;
}

export function normalizeRelativePath(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Relative path is required");
  }

  if (trimmed.includes("\0")) {
    throw new Error("Relative path cannot contain a null byte");
  }

  const normalizedSeparators = trimmed.replaceAll("\\", "/");

  if (path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed)) {
    throw new Error("Absolute paths are not allowed");
  }

  if (/^[A-Za-z]:/.test(normalizedSeparators) || normalizedSeparators.startsWith("//")) {
    throw new Error("Absolute paths are not allowed");
  }

  if (normalizedSeparators.split("/").some((segment) => segment === "..")) {
    throw new Error("Path traversal is not allowed");
  }

  const normalized = path.posix.normalize(normalizedSeparators);

  if (!normalized || normalized === ".") {
    throw new Error("Relative path is required");
  }

  return normalized.replace(/^\/+/, "").replace(/\/+$/, "");
}

function getConfigPath(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");

    return path.join(appData, "codex-to-obsidian", "config.json");
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "codex-to-obsidian",
      "config.json",
    );
  }

  const configHome =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");

  return path.join(configHome, "codex-to-obsidian", "config.json");
}

function getDefaultVaultRoot(): string {
  return path.join(os.homedir(), "Documents", DEFAULT_VAULT_NAME);
}

export async function loadConfig(): Promise<VaultConfig> {
  const vaultRootOverride = process.env.CODEX_OBSIDIAN_VAULT?.trim();
  const configPath = getConfigPath();

  if (vaultRootOverride) {
    try {
      const rawConfig = await readFile(configPath, "utf8");
      const parsedConfig = JSON.parse(rawConfig) as Partial<VaultConfig>;

      return {
        vaultRoot: path.resolve(vaultRootOverride),
        relativeSubfolder: normalizeRelativePath(
          parsedConfig.relativeSubfolder ?? DEFAULT_SUBFOLDER,
        ),
        setupRequired: false,
      };
    } catch {
      return {
        vaultRoot: path.resolve(vaultRootOverride),
        relativeSubfolder: DEFAULT_SUBFOLDER,
        setupRequired: false,
      };
    }
  }

  let rawConfig: string;

  try {
    rawConfig = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        vaultRoot: getDefaultVaultRoot(),
        relativeSubfolder: DEFAULT_SUBFOLDER,
        setupRequired: true,
      };
    }

    throw error;
  }

  const parsedConfig = JSON.parse(rawConfig) as Partial<VaultConfig>;
  const relativeSubfolder = normalizeRelativePath(
    parsedConfig.relativeSubfolder ?? DEFAULT_SUBFOLDER,
  );

  if (
    typeof parsedConfig.vaultRoot !== "string" ||
    !parsedConfig.vaultRoot.trim()
  ) {
    throw new Error("Vault root is required in config");
  }

  return {
    vaultRoot: path.resolve(parsedConfig.vaultRoot.trim()),
    relativeSubfolder,
    setupRequired: false,
  };
}

export async function ensureVaultRoot(config: VaultConfig): Promise<void> {
  await mkdir(path.join(path.resolve(config.vaultRoot), ".obsidian"), {
    recursive: true,
  });
}

export async function saveConfig(config: VaultConfig): Promise<void> {
  const configPath = getConfigPath();
  const normalizedConfig: VaultConfig = {
    vaultRoot: path.resolve(config.vaultRoot),
    relativeSubfolder: normalizeRelativePath(
      config.relativeSubfolder ?? DEFAULT_SUBFOLDER,
    ),
  };

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(normalizedConfig, null, 2)}\n`,
    "utf8",
  );
}
