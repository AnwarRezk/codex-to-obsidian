import path from "node:path";

import {
  DEFAULT_SUBFOLDER,
  normalizeRelativePath,
  type VaultConfig,
} from "./config.js";

export interface ResolvedVaultPath {
  relativePath: string;
  absolutePath: string;
}

export function resolveVaultPath(
  config: VaultConfig,
  candidatePath: string,
): ResolvedVaultPath {
  const vaultRoot = path.resolve(config.vaultRoot);
  const configuredSubfolder = normalizeRelativePath(
    config.relativeSubfolder ?? DEFAULT_SUBFOLDER,
  );
  const relativePath = normalizeRelativePath(candidatePath);

  if (
    relativePath !== configuredSubfolder &&
    !relativePath.startsWith(`${configuredSubfolder}/`)
  ) {
    throw new Error("Path is outside configured folder");
  }

  const absolutePath = path.resolve(vaultRoot, ...relativePath.split("/"));
  const relativeToVaultRoot = path.relative(vaultRoot, absolutePath);

  if (relativeToVaultRoot.startsWith("..") || path.isAbsolute(relativeToVaultRoot)) {
    throw new Error("Path is outside configured folder");
  }

  return {
    relativePath,
    absolutePath,
  };
}
