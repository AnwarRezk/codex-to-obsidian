export interface NoteFrontmatter {
  title: string;
  codexKey: string;
  created: string;
  updated: string;
  sourceUrl?: string;
}

export interface NoteDraft extends NoteFrontmatter {
  summary: string;
  decisions: readonly string[];
  actionItems: readonly string[];
  openQuestions: readonly string[];
}

export interface SelectOperationInput {
  operation?: string | null;
  matchingNoteExists: boolean;
}

export type NoteOperation = "create" | "update";

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function escapeMarkdownLinkTarget(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
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

function normalizeSourceUrl(sourceUrl?: string): string | undefined {
  const trimmed = sourceUrl?.trim();

  return trimmed ? trimmed : undefined;
}

function formatSection(title: string, bodyLines: readonly string[]): string[] {
  return [title, ...bodyLines, ""];
}

function renderList(items: readonly string[]): string[] {
  if (items.length === 0) {
    return ["None"];
  }

  return items.map((item) => `- ${item}`);
}

export function renderNote(draft: NoteDraft): string {
  const sourceUrl = normalizeSourceUrl(draft.sourceUrl);
  const frontmatterLines = [
    "---",
    `title: ${yamlQuote(draft.title)}`,
    `codex_key: ${yamlQuote(draft.codexKey)}`,
    `created: ${yamlQuote(draft.created)}`,
    `updated: ${yamlQuote(draft.updated)}`,
    ...(sourceUrl ? [`source_url: ${yamlQuote(sourceUrl)}`] : []),
    "---",
  ];

  const sections = [
    formatSection("# Summary", draft.summary.split(/\r?\n/)),
    formatSection("## Decisions", renderList(draft.decisions)),
    formatSection("## Action items", renderList(draft.actionItems)),
    formatSection("## Open questions", renderList(draft.openQuestions)),
    formatSection(
      "## Source conversation",
      sourceUrl
        ? [
            `[Open the original Codex conversation](${escapeMarkdownLinkTarget(sourceUrl)})`,
          ]
        : ["Source conversation: unavailable"],
    ),
  ];

  const lines = [...frontmatterLines, ...sections.flat()];

  while (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.join("\n");
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
