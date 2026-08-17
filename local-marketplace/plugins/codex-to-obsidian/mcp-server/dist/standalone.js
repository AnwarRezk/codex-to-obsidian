import { createInterface } from "node:readline";
import { mkdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_SUBFOLDER, DEFAULT_VAULT_NAME, ensureVaultRoot, loadConfig, saveConfig, } from "./config.js";
import { buildObsidianOpenUri } from "./obsidian-uri.js";
import { resolveVaultPath } from "./paths.js";
import { createNote, findNote, updateNote } from "./vault.js";
export const toolDefinitions = [
    {
        name: "get_status",
        description: "Report vault configuration status for the Obsidian bridge",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    {
        name: "setup_vault",
        description: "Configure and initialize the Obsidian vault used by the bridge",
        inputSchema: {
            type: "object",
            properties: { vaultRoot: { type: "string" } },
            additionalProperties: false,
        },
        annotations: { destructiveHint: false, idempotentHint: true },
    },
    {
        name: "find_note",
        description: "Find notes by codex_key inside the configured conversations folder",
        inputSchema: {
            type: "object",
            properties: { codex_key: { type: "string" } },
            required: ["codex_key"],
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    {
        name: "create_note",
        description: "Create a new note in the configured conversations folder",
        inputSchema: noteInputSchema(),
        annotations: { destructiveHint: false },
    },
    {
        name: "update_note",
        description: "Update an existing note in the configured conversations folder",
        inputSchema: noteInputSchema(),
        annotations: { destructiveHint: false },
    },
    {
        name: "open_note",
        description: "Return an Obsidian URI for a validated note path",
        inputSchema: {
            type: "object",
            properties: { relativePath: { type: "string" } },
            required: ["relativePath"],
            additionalProperties: false,
        },
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
];
function noteInputSchema() {
    return {
        type: "object",
        properties: {
            title: { type: "string" },
            codex_key: { type: "string" },
            relativePath: { type: "string" },
            created: { type: "string" },
            updated: { type: "string" },
            body: { type: "string" },
        },
        required: [
            "title",
            "codex_key",
            "relativePath",
            "created",
            "updated",
            "body",
        ],
        additionalProperties: false,
    };
}
function response(id, result) {
    return { jsonrpc: "2.0", id, result };
}
function errorResponse(id, code, message) {
    return { jsonrpc: "2.0", id, error: { code, message } };
}
function textResult(text, structuredContent) {
    return {
        content: [{ type: "text", text }],
        structuredContent,
    };
}
function safeMessage(error) {
    const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error";
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes("eacces") || normalized.includes("eperm") || normalized.includes("permission denied")) {
        return "permission denied";
    }
    if (normalized === "already exists" || normalized === "note already exists")
        return "already exists";
    if (normalized.includes("codex key does not match"))
        return "codex key mismatch";
    if (normalized.includes("codex key is missing"))
        return "codex key missing";
    if (normalized.includes("outside configured folder") ||
        normalized.includes("path traversal") ||
        normalized.includes("absolute paths") ||
        normalized.includes("null byte")) {
        return "outside configured folder";
    }
    if (normalized === "setup required")
        return "setup required";
    if (normalized === "required or invalid input")
        return "required or invalid input";
    if (normalized.includes("invalid config") || normalized.includes("required or invalid")) {
        return "required or invalid config";
    }
    return "Unexpected server error";
}
async function loadVaultConfigOrThrow() {
    try {
        const config = await loadConfig();
        if (config.setupRequired)
            throw new Error("setup required");
        await ensureVaultRoot(config);
        const realVaultRoot = await realpath(config.vaultRoot);
        const vaultStats = await stat(realVaultRoot);
        if (!vaultStats.isDirectory())
            throw new Error("required or invalid config");
        return config;
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
    if (!path.isAbsolute(selected))
        throw new Error("required or invalid input");
    return path.resolve(selected);
}
function asString(value) {
    if (typeof value !== "string" || !value.trim())
        throw new Error("required or invalid input");
    return value;
}
function asNotePayload(value) {
    if (!value || typeof value !== "object")
        throw new Error("required or invalid input");
    const input = value;
    const payload = {
        title: asString(input.title),
        codex_key: asString(input.codex_key),
        relativePath: asString(input.relativePath),
        created: asString(input.created),
        updated: asString(input.updated),
        body: asString(input.body),
    };
    return payload;
}
function toDraft(payload) {
    return {
        title: payload.title,
        codexKey: payload.codex_key,
        created: payload.created,
        updated: payload.updated,
        body: payload.body,
    };
}
async function callTool(name, args) {
    try {
        if (name === "get_status") {
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
        if (name === "setup_vault") {
            const input = args;
            const config = {
                vaultRoot: setupVaultRoot(input?.vaultRoot === undefined ? undefined : asString(input.vaultRoot)),
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
        const config = await loadVaultConfigOrThrow();
        if (name === "find_note") {
            const codexKey = asString(args?.codex_key);
            const relativePaths = await findNote(config, codexKey);
            const status = relativePaths.length === 0 ? "not_found" : relativePaths.length === 1 ? "found" : "ambiguous";
            return textResult(`status=${status} matchCount=${relativePaths.length}`, {
                status,
                codex_key: codexKey,
                matchCount: relativePaths.length,
                relativePaths,
            });
        }
        if (name === "create_note" || name === "update_note") {
            const payload = asNotePayload(args);
            const result = name === "create_note"
                ? await createNote(config, payload.relativePath, toDraft(payload))
                : await updateNote(config, payload.relativePath, toDraft(payload));
            const status = name === "create_note" ? "created" : "updated";
            return textResult(`status=${status} relativePath=${result.relativePath}`, {
                status,
                relativePath: result.relativePath,
                codex_key: result.codexKey,
            });
        }
        if (name === "open_note") {
            const relativePath = asString(args?.relativePath);
            const resolved = resolveVaultPath(config, relativePath);
            return textResult(`status=ok relativePath=${resolved.relativePath}`, {
                status: "ok",
                relativePath: resolved.relativePath,
                uri: buildObsidianOpenUri(config.vaultRoot, resolved.relativePath),
            });
        }
        throw new Error("Unknown tool");
    }
    catch (error) {
        const message = safeMessage(error);
        return {
            content: [{ type: "text", text: `status=error message=${message}` }],
            isError: true,
            structuredContent: { status: "error", message },
        };
    }
}
export async function handleRequest(request) {
    const id = request.id ?? null;
    if (request.method === "notifications/initialized")
        return undefined;
    if (request.method === "ping")
        return response(id, {});
    if (request.method === "initialize") {
        return response(id, {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "codex-to-obsidian", version: "0.1.0" },
        });
    }
    if (request.method === "tools/list")
        return response(id, { tools: toolDefinitions });
    if (request.method === "tools/call") {
        const name = request.params?.name;
        if (typeof name !== "string")
            return errorResponse(id, -32602, "Tool name is required");
        return response(id, await callTool(name, request.params?.arguments));
    }
    return errorResponse(id, -32601, `Method not found: ${request.method}`);
}
export async function runStandaloneServer() {
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
        if (!line.trim())
            continue;
        try {
            const request = JSON.parse(line);
            const result = await handleRequest(request);
            if (result)
                process.stdout.write(`${JSON.stringify(result)}\n`);
        }
        catch {
            process.stdout.write(`${JSON.stringify(errorResponse(null, -32700, "Parse error"))}\n`);
        }
    }
}
const isMainModule = process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
    void runStandaloneServer().catch(() => {
        process.exitCode = 1;
    });
}
