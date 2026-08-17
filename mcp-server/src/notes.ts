export interface NoteFrontmatter {
  title: string;
  codexKey: string;
  created: string;
  updated: string;
}

export interface NoteDraft extends NoteFrontmatter {
  body: string;
}

export interface SelectOperationInput {
  operation?: string | null;
  matchingNoteExists: boolean;
}

export type NoteOperation = "create" | "update";

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function normalizeDatePrefix(created: string): string {
  const trimmed = created.trim();

  const datePrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

  if (datePrefix) {
    return datePrefix;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Created date is invalid");
  }

  return parsed.toISOString().slice(0, 10);
}

const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function sanitizeTitleForFilename(title: string): string {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!cleaned) {
    return "Untitled";
  }

  const normalizedBaseName = cleaned.split(".")[0]?.trim().replace(/[. ]+$/g, "");

  if (
    normalizedBaseName &&
    WINDOWS_RESERVED_DEVICE_NAMES.has(normalizedBaseName.toUpperCase())
  ) {
    return `note-${cleaned}-note`;
  }

  return cleaned;
}

function normalizeBody(body: string): string {
  const normalized = body.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");

  while (lines.length > 0 && lines[0]?.trim() === "") {
    lines.shift();
  }

  while (lines.length > 0 && lines.at(-1)?.trim() === "") {
    lines.pop();
  }

  const trimmed = lines.join("\n");

  if (!trimmed) {
    throw new Error("Body is required");
  }

  return trimmed;
}

export function renderNote(draft: NoteDraft): string {
  const frontmatterLines = [
    "---",
    `title: ${yamlQuote(draft.title)}`,
    `codex_key: ${yamlQuote(draft.codexKey)}`,
    `created: ${yamlQuote(draft.created)}`,
    `updated: ${yamlQuote(draft.updated)}`,
    "---",
  ];
  const body = normalizeBody(draft.body);

  return [...frontmatterLines, "", ...body.split("\n")].join("\n");
}

export function buildFilename(created: string, title: string): string {
  const datePart = normalizeDatePrefix(created);
  const safeTitle = sanitizeTitleForFilename(title);

  return `${datePart} - ${safeTitle}.md`;
}

export function selectOperation({
  operation,
  matchingNoteExists,
}: SelectOperationInput): NoteOperation {
  const normalizedOperation = operation?.trim();

  if (!normalizedOperation) {
    return matchingNoteExists ? "update" : "create";
  }

  switch (normalizedOperation.toLowerCase()) {
    case "save":
      return "create";
    case "update":
      return "update";
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
