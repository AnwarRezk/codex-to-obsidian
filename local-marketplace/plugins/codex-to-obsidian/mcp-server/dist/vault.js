import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, writeFile, } from "node:fs/promises";
import path from "node:path";
import { resolveVaultPath } from "./paths.js";
import { renderNote } from "./notes.js";
function isContainedWithin(basePath, candidatePath) {
    const normalizedBase = path.resolve(basePath);
    const normalizedCandidate = path.resolve(candidatePath);
    const relativePath = process.platform === "win32"
        ? path.win32.relative(normalizedBase.toLowerCase(), normalizedCandidate.toLowerCase())
        : path.relative(normalizedBase, normalizedCandidate);
    return (relativePath === "" ||
        (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)));
}
function assertContainedWithin(basePath, candidatePath) {
    if (!isContainedWithin(basePath, candidatePath)) {
        throw new Error("Path is outside configured folder");
    }
}
async function nearestExistingAncestor(candidatePath) {
    let currentPath = path.resolve(candidatePath);
    while (true) {
        try {
            await realpath(currentPath);
            return currentPath;
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                return currentPath;
            }
            currentPath = parentPath;
        }
    }
}
async function loadVaultContainment(config) {
    const realVaultRoot = await realpath(path.resolve(config.vaultRoot));
    const configuredFolderPath = resolveVaultPath(config, config.relativeSubfolder).absolutePath;
    const nearestAncestor = await nearestExistingAncestor(configuredFolderPath);
    const realConfiguredFolderReference = await realpath(nearestAncestor);
    assertContainedWithin(realVaultRoot, realConfiguredFolderReference);
    return {
        realVaultRoot,
        configuredFolderPath,
        realConfiguredFolderReference,
    };
}
async function assertTargetContained(config, targetPath) {
    const { realVaultRoot, configuredFolderPath } = await loadVaultContainment(config);
    const realConfiguredFolder = await realpath(configuredFolderPath);
    const nearestAncestor = await nearestExistingAncestor(targetPath);
    const realNearestAncestor = await realpath(nearestAncestor);
    assertContainedWithin(realVaultRoot, realConfiguredFolder);
    assertContainedWithin(realConfiguredFolder, realNearestAncestor);
}
async function assertPotentialTargetContained(config, targetPath) {
    const { realVaultRoot, realConfiguredFolderReference } = await loadVaultContainment(config);
    const nearestAncestor = await nearestExistingAncestor(targetPath);
    const realNearestAncestor = await realpath(nearestAncestor);
    assertContainedWithin(realVaultRoot, realConfiguredFolderReference);
    assertContainedWithin(realConfiguredFolderReference, realNearestAncestor);
}
async function readFrontmatterValue(fileContents, fieldName) {
    const lines = fileContents.split(/\r?\n/);
    if (lines[0] !== "---") {
        return undefined;
    }
    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line === "---") {
            return undefined;
        }
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!match || match[1] !== fieldName) {
            continue;
        }
        const rawValue = match[2].trim();
        if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
            (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
            try {
                return JSON.parse(rawValue);
            }
            catch {
                return rawValue.slice(1, -1);
            }
        }
        return rawValue;
    }
    return undefined;
}
function toVaultRelativePath(vaultRoot, absolutePath) {
    return path
        .relative(vaultRoot, absolutePath)
        .split(path.sep)
        .join("/");
}
function getVaultFolder(config) {
    return resolveVaultPath(config, config.relativeSubfolder).absolutePath;
}
async function readMatchingMarkdownFiles(logicalDirectory, realDirectory, vaultRoot, codexKey, realConfiguredFolderReference, visitedDirectories = new Set()) {
    assertContainedWithin(realConfiguredFolderReference, realDirectory);
    if (visitedDirectories.has(realDirectory)) {
        return [];
    }
    visitedDirectories.add(realDirectory);
    let directoryEntries;
    try {
        directoryEntries = await readdir(realDirectory, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const matches = [];
    for (const entry of directoryEntries) {
        const logicalEntryPath = path.join(logicalDirectory, entry.name);
        const realEntryCandidatePath = path.join(realDirectory, entry.name);
        let realEntryPath;
        try {
            realEntryPath = await realpath(realEntryCandidatePath);
        }
        catch (error) {
            if (error.code === "ENOENT") {
                continue;
            }
            throw error;
        }
        assertContainedWithin(realConfiguredFolderReference, realEntryPath);
        if (entry.isDirectory()) {
            matches.push(...(await readMatchingMarkdownFiles(logicalEntryPath, realEntryPath, vaultRoot, codexKey, realConfiguredFolderReference, visitedDirectories)));
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) {
            continue;
        }
        const contents = await readFile(realEntryPath, "utf8");
        const noteCodexKey = await readFrontmatterValue(contents, "codex_key");
        if (noteCodexKey === codexKey) {
            matches.push(toVaultRelativePath(vaultRoot, logicalEntryPath));
        }
    }
    return matches;
}
export async function findNote(config, codexKey) {
    const { realVaultRoot, realConfiguredFolderReference, } = await loadVaultContainment(config);
    const vaultFolder = getVaultFolder(config);
    let realVaultFolder;
    try {
        realVaultFolder = await realpath(vaultFolder);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const matches = await readMatchingMarkdownFiles(vaultFolder, realVaultFolder, config.vaultRoot, codexKey, realConfiguredFolderReference);
    return matches.sort((left, right) => left.localeCompare(right));
}
export async function createNote(config, relativePath, draft) {
    const resolvedPath = resolveVaultPath(config, relativePath);
    const nextContents = renderNote(draft);
    await assertPotentialTargetContained(config, path.dirname(resolvedPath.absolutePath));
    await mkdir(path.dirname(resolvedPath.absolutePath), { recursive: true });
    await assertTargetContained(config, path.dirname(resolvedPath.absolutePath));
    try {
        await writeFile(resolvedPath.absolutePath, nextContents, {
            encoding: "utf8",
            flag: "wx",
        });
    }
    catch (error) {
        if (error.code === "EEXIST") {
            throw new Error("Note already exists");
        }
        throw error;
    }
    return {
        relativePath: resolvedPath.relativePath,
        absolutePath: resolvedPath.absolutePath,
        codexKey: draft.codexKey,
    };
}
export async function updateNote(config, relativePath, draft) {
    const resolvedPath = resolveVaultPath(config, relativePath);
    await assertTargetContained(config, resolvedPath.absolutePath);
    const existingContents = await readFile(resolvedPath.absolutePath, "utf8");
    const existingCodexKey = await readFrontmatterValue(existingContents, "codex_key");
    const existingCreated = await readFrontmatterValue(existingContents, "created");
    if (!existingCodexKey) {
        throw new Error("Note codex key is missing");
    }
    if (existingCodexKey !== draft.codexKey) {
        throw new Error("Note codex key does not match");
    }
    if (!existingCreated) {
        throw new Error("Note created value is missing");
    }
    const tempPath = path.join(path.dirname(resolvedPath.absolutePath), `.${path.basename(resolvedPath.absolutePath)}.${randomUUID()}.tmp`);
    const nextContents = renderNote({
        ...draft,
        created: existingCreated,
    });
    await writeFile(tempPath, nextContents, "utf8");
    await rename(tempPath, resolvedPath.absolutePath);
    return {
        relativePath: resolvedPath.relativePath,
        absolutePath: resolvedPath.absolutePath,
        codexKey: draft.codexKey,
    };
}
