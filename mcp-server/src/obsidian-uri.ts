import path from "node:path";

export function buildObsidianOpenUri(
  vaultRoot: string,
  relativePath: string,
): string {
  const vaultName = path.basename(path.resolve(vaultRoot)) || "vault";
  const normalizedRelativePath = relativePath.replaceAll("\\", "/");

  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(normalizedRelativePath)}`;
}
