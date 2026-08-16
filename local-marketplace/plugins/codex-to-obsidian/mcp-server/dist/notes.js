function yamlQuote(value) {
    return JSON.stringify(value);
}
function escapeMarkdownLinkTarget(value) {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)");
}
function normalizeDatePrefix(created) {
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
function sanitizeTitleForFilename(title) {
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
    if (normalizedBaseName &&
        WINDOWS_RESERVED_DEVICE_NAMES.has(normalizedBaseName.toUpperCase())) {
        return `note-${cleaned}-note`;
    }
    return cleaned;
}
function normalizeSourceUrl(sourceUrl) {
    const trimmed = sourceUrl?.trim();
    return trimmed ? trimmed : undefined;
}
function formatSection(title, bodyLines) {
    return [title, ...bodyLines, ""];
}
function renderList(items) {
    if (items.length === 0) {
        return ["None"];
    }
    return items.map((item) => `- ${item}`);
}
export function renderNote(draft) {
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
        formatSection("## Source conversation", sourceUrl
            ? [
                `[Open the original Codex conversation](${escapeMarkdownLinkTarget(sourceUrl)})`,
            ]
            : ["Source conversation: unavailable"]),
    ];
    const lines = [...frontmatterLines, ...sections.flat()];
    while (lines.at(-1) === "") {
        lines.pop();
    }
    return lines.join("\n");
}
export function buildFilename(created, title) {
    const datePart = normalizeDatePrefix(created);
    const safeTitle = sanitizeTitleForFilename(title);
    return `${datePart} - ${safeTitle}.md`;
}
export function selectOperation({ operation, matchingNoteExists, }) {
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
