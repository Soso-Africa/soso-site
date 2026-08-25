export type JournalBodyBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export type JournalInline =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const PUBLIC_INTERNAL_DESTINATION =
  /^(?:\/(?:journal|product|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*|\/(?:shop|faq|about))$/;

export function isPublicJournalDestination(value: string): boolean {
  return PUBLIC_INTERNAL_DESTINATION.test(value);
}

/**
 * Parse only the small Markdown link subset used by editorial copy. Invalid,
 * malformed and non-public targets remain literal text for React to escape.
 */
export function journalInlineParts(value: string): JournalInline[] {
  const result: JournalInline[] = [];
  const appendText = (text: string) => {
    if (!text) return;
    const previous = result[result.length - 1];
    if (previous?.type === "text") previous.text += text;
    else result.push({ type: "text", text });
  };
  const pattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) appendText(value.slice(cursor, match.index));
    if (isPublicJournalDestination(match[2])) {
      result.push({ type: "link", text: match[1], href: match[2] });
    } else {
      appendText(match[0]);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) appendText(value.slice(cursor));
  return result.length ? result : [{ type: "text", text: value }];
}

/**
 * Convert the plain-text editorial format into safe, meaningful document
 * structure. Input always remains text; CMS HTML is never injected.
 */
export function journalBodyBlocks(body: string): JournalBodyBlock[] {
  return body.trim().split(/\n{2,}/).map((raw) => {
    const text = raw.trim();
    const heading = text.match(/^#{1,3}\s+(.+)$/);
    if (heading) return { type: "heading" as const, text: heading[1].trim() };
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((line) => /^[-*•]\s+/.test(line))) {
      return { type: "list" as const, items: lines.map((line) => line.replace(/^[-*•]\s+/, "")) };
    }
    return { type: "paragraph" as const, text: lines.join(" ") };
  }).filter((block) => block.type !== "paragraph" || block.text.length > 0);
}