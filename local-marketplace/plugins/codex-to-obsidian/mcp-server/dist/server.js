import { pathToFileURL } from "node:url";
import { mkdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_SUBFOLDER, DEFAULT_VAULT_NAME, ensureVaultRoot, loadConfig, saveConfig, } from "./config.js";
import { buildObsidianOpenUri } from "./obsidian-uri.js";
import { resolveVaultPath } from "./paths.js";
import { createNote, findNote, updateNote } from "./vault.js";
const relativePathSchema = z.string().trim().min(1);
const notePayloadSchema = z.object({
    title: z.string().trim().min(1),
    codex_key: z.string().trim().min(1),
    relativePath: relativePathSchema,
    created: z.string().trim().min(1),
    updated: z.string().trim().min(1),
    body: z.string().trim().min(1),
});
const statusResultSchema = z
    .object({
    status: z.enum(["setup_required", "ready", "error"]),
    vaultRoot: z.string().optional(),
    relativeSubfolder: z.string().optional(),
    message: z.string().optional(),
})
    .strict();
const setupResultSchema = z
    .object({
    status: z.enum(["configured", "error"]),
    vaultRoot: z.string().optional(),
    relativeSubfolder: z.string().optional(),
    message: z.string().optional(),
})
    .strict();
const findResultSchema = z
    .object({
    status: z.enum(["not_found", "found", "ambiguous", "error"]),
    codex_key: z.string().optional(),
    matchCount: z.number().int().nonnegative().optional(),
    relativePaths: z.array(z.string()).optional(),
    message: z.string().optional(),
})
    .strict();
const writeResultSchema = z
    .object({
    status: z.enum(["created", "updated", "error"]),
    relativePath: z.string().optional(),
    codex_key: z.string().optional(),
    message: z.string().optional(),
})
    .strict();
const openResultSchema = z
    .object({
    status: z.enum(["ok", "error"]),
    relativePath: z.string().optional(),
    uri: z.string().optional(),
    message: z.string().optional(),
})
    .strict();
function toDraft(payload) {
    return {
        title: payload.title,
        codexKey: payload.codex_key,
        created: payload.created,
        updated: payload.updated,
        body: payload.body,
    };
}
function safeMessage(error) {
    const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error";
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes("eacces") || normalized.includes("eperm") || normalized.includes("permission denied")) {
        return "permission denied";
    }
    if (normalized === "already exists" || normalized === "note already exists") {
        return "already exists";
    }
    if (normalized === "codex key mismatch" || normalized.includes("codex key does not match")) {
        return "codex key mismatch";
    }
    if (normalized === "codex key missing" || normalized.includes("codex key is missing")) {
        return "codex key missing";
    }
    if (normalized === "setup required") {
        return "setup required";
    }
    if (normalized === "required or invalid input") {
        return "required or invalid input";
    }
    if (normalized === "outside configured folder" ||
        normalized === "path is outside configured folder" ||
        normalized === "path traversal is not allowed" ||
        normalized === "absolute paths are not allowed" ||
        normalized === "relative path cannot contain a null byte") {
        return "outside configured folder";
    }
    if (normalized === "required or invalid config" ||
        normalized.includes("invalid config") ||
        normalized.includes("relative path is required") ||
        normalized.includes("relative path cannot contain a null byte") ||
        normalized.includes("absolute paths are not allowed") ||
        normalized.includes("created date is invalid")) {
        return "required or invalid config";
    }
    return "Unexpected server error";
}
function textResult(text, structuredContent) {
    return {
        content: [{ type: "text", text }],
        structuredContent,
    };
}
async function loadVaultConfigOrThrow() {
    try {
        const config = await loadConfig();
        if (config.setupRequired) {
            throw new Error("setup required");
        }
        await ensureVaultRoot(config);
        const realVaultRoot = await realpath(config.vaultRoot);
        const vaultStats = await stat(realVaultRoot);
        if (!vaultStats.isDirectory()) {
            throw new Error("required or invalid config");
        }
        return {
            ...config,
        };
    }
    catch (error) {
        if (error instanceof Error && error.message === "setup required") {
            throw error;
        }
        const code = error;
        if (code.code === "EACCES" || code.code === "EPERM") {
            throw new Error("permission denied");
        }
        throw new Error("required or invalid config");
    }
}
function setupVaultRoot(input) {
    const selected = input?.trim() || path.join(os.homedir(), "Documents", DEFAULT_VAULT_NAME);
    if (!path.isAbsolute(selected)) {
        throw new Error("required or invalid input");
    }
    return path.resolve(selected);
}
export function buildServer() {
    const server = new McpServer({
        name: "codex-to-obsidian",
        version: "0.1.0",
    });
    server.registerTool("setup_vault", {
        description: "Configure and initialize the Obsidian vault used by the bridge",
        inputSchema: z.object({
            vaultRoot: z.string().trim().min(1).optional(),
        }),
        annotations: { destructiveHint: false, idempotentHint: true },
        outputSchema: setupResultSchema,
    }, async ({ vaultRoot }) => {
        try {
            const config = {
                vaultRoot: setupVaultRoot(vaultRoot),
                relativeSubfolder: DEFAULT_SUBFOLDER,
            };
            await ensureVaultRoot(config);
            await mkdir(resolveVaultPath(config, config.relativeSubfolder).absolutePath, {
                recursive: true,
            });
            await saveConfig(config);
            return textResult(`status=configured vaultRoot=${config.vaultRoot}`, {
                status: "configured",
                vaultRoot: config.vaultRoot,
                relativeSubfolder: config.relativeSubfolder,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    server.registerTool("get_status", {
        description: "Report vault configuration status for the Obsidian bridge",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, idempotentHint: true },
        outputSchema: statusResultSchema,
    }, async () => {
        try {
            const initialConfig = await loadConfig();
            if (initialConfig.setupRequired) {
                return textResult(`status=setup_required vaultRoot=${initialConfig.vaultRoot} relativeSubfolder=${initialConfig.relativeSubfolder}`, {
                    status: "setup_required",
                    vaultRoot: initialConfig.vaultRoot,
                    relativeSubfolder: initialConfig.relativeSubfolder,
                });
            }
            const config = await loadVaultConfigOrThrow();
            return textResult(`status=ready relativeSubfolder=${config.relativeSubfolder}`, {
                status: "ready",
                relativeSubfolder: config.relativeSubfolder,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    server.registerTool("find_note", {
        description: "Find notes by codex_key inside the configured conversations folder",
        inputSchema: z.object({
            codex_key: z.string().trim().min(1),
        }),
        annotations: { readOnlyHint: true, idempotentHint: true },
        outputSchema: findResultSchema,
    }, async ({ codex_key }) => {
        try {
            const config = await loadVaultConfigOrThrow();
            const relativePaths = await findNote(config, codex_key);
            const status = relativePaths.length === 0
                ? "not_found"
                : relativePaths.length === 1
                    ? "found"
                    : "ambiguous";
            return textResult(`status=${status} matchCount=${relativePaths.length}`, {
                status,
                codex_key,
                matchCount: relativePaths.length,
                relativePaths,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    server.registerTool("create_note", {
        description: "Create a new note in the configured conversations folder",
        inputSchema: notePayloadSchema,
        annotations: { destructiveHint: false },
        outputSchema: writeResultSchema,
    }, async (payload) => {
        try {
            const config = await loadVaultConfigOrThrow();
            const result = await createNote(config, payload.relativePath, toDraft(payload));
            return textResult(`status=created relativePath=${result.relativePath}`, {
                status: "created",
                relativePath: result.relativePath,
                codex_key: result.codexKey,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    server.registerTool("update_note", {
        description: "Update an existing note in the configured conversations folder",
        inputSchema: notePayloadSchema,
        annotations: { destructiveHint: false },
        outputSchema: writeResultSchema,
    }, async (payload) => {
        try {
            const config = await loadVaultConfigOrThrow();
            const result = await updateNote(config, payload.relativePath, toDraft(payload));
            return textResult(`status=updated relativePath=${result.relativePath}`, {
                status: "updated",
                relativePath: result.relativePath,
                codex_key: result.codexKey,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    server.registerTool("open_note", {
        description: "Return an Obsidian URI for a validated note path",
        inputSchema: z.object({
            relativePath: relativePathSchema,
        }),
        annotations: { readOnlyHint: true, idempotentHint: true },
        outputSchema: openResultSchema,
    }, async ({ relativePath }) => {
        try {
            const config = await loadVaultConfigOrThrow();
            const resolved = resolveVaultPath(config, relativePath);
            const uri = buildObsidianOpenUri(config.vaultRoot, resolved.relativePath);
            return textResult(`status=ok relativePath=${resolved.relativePath}`, {
                status: "ok",
                relativePath: resolved.relativePath,
                uri,
            });
        }
        catch (error) {
            const message = safeMessage(error);
            return {
                content: [{ type: "text", text: `status=error message=${message}` }],
                isError: true,
                structuredContent: {
                    status: "error",
                    message,
                },
            };
        }
    });
    return server;
}
export async function runServer() {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
const isMainModule = process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
    void runServer().catch(() => {
        process.exitCode = 1;
    });
}
