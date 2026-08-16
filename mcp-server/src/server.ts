import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { buildObsidianOpenUri } from "./obsidian-uri.js";
import { resolveVaultPath } from "./paths.js";
import { createNote, findNote, updateNote } from "./vault.js";

const relativePathSchema = z.string().trim().min(1);

const notePayloadSchema = z.object({
  title: z.string().trim().min(1),
  codexKey: z.string().trim().min(1),
  relativePath: relativePathSchema,
  created: z.string().trim().min(1),
  updated: z.string().trim().min(1),
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(z.string()),
  openQuestions: z.array(z.string()),
  sourceUrl: z.string().trim().min(1).optional(),
});

type NotePayload = z.infer<typeof notePayloadSchema>;

const statusResultSchema = z.object({
  status: z.string(),
  relativeSubfolder: z.string().optional(),
  message: z.string().optional(),
});

const findResultSchema = z.object({
  status: z.string(),
  matchCount: z.number(),
  relativePaths: z.array(z.string()),
  message: z.string().optional(),
});

const writeResultSchema = z.object({
  status: z.string(),
  relativePath: z.string(),
  codexKey: z.string(),
  message: z.string().optional(),
});

const openResultSchema = z.object({
  status: z.string(),
  relativePath: z.string(),
  uri: z.string(),
  message: z.string().optional(),
});

function toDraft(payload: NotePayload) {
  return {
    title: payload.title,
    codexKey: payload.codexKey,
    created: payload.created,
    updated: payload.updated,
    summary: payload.summary,
    decisions: payload.decisions,
    actionItems: payload.actionItems,
    openQuestions: payload.openQuestions,
    sourceUrl: payload.sourceUrl,
  };
}

function safeMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error";

  return rawMessage.replace(/\s+/g, " ").trim().slice(0, 240) || "Unexpected server error";
}

function textResult(
  text: string,
  structuredContent: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

async function loadVaultConfigOrThrow() {
  const config = await loadConfig();

  return config;
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "codex-to-obsidian",
    version: "0.1.0",
  });

  server.registerTool(
    "get_status",
    {
      description: "Report vault configuration status for the Obsidian bridge",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: statusResultSchema,
    },
    async (): Promise<CallToolResult> => {
      try {
        const config = await loadVaultConfigOrThrow();

        return textResult(
          `status=ready relativeSubfolder=${config.relativeSubfolder}`,
          {
            status: "ready",
            relativeSubfolder: config.relativeSubfolder,
          },
        );
      } catch (error) {
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
    },
  );

  server.registerTool(
    "find_note",
    {
      description: "Find notes by codex_key inside the configured conversations folder",
      inputSchema: z.object({
        codexKey: z.string().trim().min(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: findResultSchema,
    },
    async ({ codexKey }): Promise<CallToolResult> => {
      try {
        const config = await loadVaultConfigOrThrow();
        const relativePaths = await findNote(config, codexKey);
        const status =
          relativePaths.length === 0
            ? "not_found"
            : relativePaths.length === 1
              ? "found"
              : "ambiguous";

        return textResult(
          `status=${status} matchCount=${relativePaths.length}`,
          {
            status,
            matchCount: relativePaths.length,
            relativePaths,
          },
        );
      } catch (error) {
        const message = safeMessage(error);

        return {
          content: [{ type: "text", text: `status=error message=${message}` }],
          isError: true,
          structuredContent: {
            status: "error",
            matchCount: 0,
            relativePaths: [],
            message,
          },
        };
      }
    },
  );

  server.registerTool(
    "create_note",
    {
      description: "Create a new note in the configured conversations folder",
      inputSchema: notePayloadSchema,
      annotations: { destructiveHint: false },
      outputSchema: writeResultSchema,
    },
    async (payload): Promise<CallToolResult> => {
      try {
        const config = await loadVaultConfigOrThrow();
        const result = await createNote(config, payload.relativePath, toDraft(payload));

        return textResult(`status=created relativePath=${result.relativePath}`, {
          status: "created",
          relativePath: result.relativePath,
          codexKey: result.codexKey,
        });
      } catch (error) {
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
    },
  );

  server.registerTool(
    "update_note",
    {
      description: "Update an existing note in the configured conversations folder",
      inputSchema: notePayloadSchema,
      annotations: { destructiveHint: false },
      outputSchema: writeResultSchema,
    },
    async (payload): Promise<CallToolResult> => {
      try {
        const config = await loadVaultConfigOrThrow();
        const result = await updateNote(config, payload.relativePath, toDraft(payload));

        return textResult(`status=updated relativePath=${result.relativePath}`, {
          status: "updated",
          relativePath: result.relativePath,
          codexKey: result.codexKey,
        });
      } catch (error) {
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
    },
  );

  server.registerTool(
    "open_note",
    {
      description: "Return an Obsidian URI for a validated note path",
      inputSchema: z.object({
        relativePath: relativePathSchema,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: openResultSchema,
    },
    async ({ relativePath }): Promise<CallToolResult> => {
      try {
        const config = await loadVaultConfigOrThrow();
        const resolved = resolveVaultPath(config, relativePath);
        const uri = buildObsidianOpenUri(config.vaultRoot, resolved.relativePath);

        return textResult(`status=ok relativePath=${resolved.relativePath}`, {
          status: "ok",
          relativePath: resolved.relativePath,
          uri,
        });
      } catch (error) {
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
    },
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  void runServer().catch(() => {
    process.exitCode = 1;
  });
}
