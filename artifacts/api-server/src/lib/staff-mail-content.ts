import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { MailError } from "./staff-mail-security";

export type MailAttachment = { name: string; contentBase64: string };
export const MAX_MAIL_FILE_BYTES = 1_000_000;
export const MAX_MAIL_TOTAL_BYTES = 2_000_000;

/** Deliberately no images, CSS, forms or embedded content: opening mail never
 * contacts a sender's servers or runs their markup in Staff's origin. */
export function safeMailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "hr", "table", "thead", "tbody", "tr", "td", "th", "a"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        let href = attributes.href ?? "";
        try {
          const url = new URL(href);
          if (!["http:", "https:", "mailto:"].includes(url.protocol) || url.username || url.password) href = "";
        } catch { href = ""; }
        return { tagName: "a", attribs: { ...(href ? { href } : {}), target: "_blank", rel: "noopener noreferrer", ...(attributes.title ? { title: attributes.title } : {}) } };
      },
    },
  });
}
export function mailContent(text: string, html?: string | null) {
  if (html == null) return { text, html: undefined };
  const clean = safeMailHtml(html);
  const plain = convert(clean, { wordwrap: false, limits: { maxInputLength: 100_000 }, selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }] }).trim();
  if (!plain || plain.length > 24_000) throw new MailError("The formatted message must contain readable text and fit within 24,000 characters.");
  return { text: plain, html: clean };
}
export function plainMailHtml(text: string) {
  return `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\n", "<br>")}</p>`;
}
export function safeAttachmentName(name: string) {
  return name.replace(/[\x00-\x1f\x7f/\\"\u202a-\u202e\u2066-\u2069]/g, "_").replace(/^[. ]+/, "").slice(0, 180) || "attachment";
}
/** Bounded in-memory attachments only. Never accept filesystem paths or URLs. */
export function decodeMailAttachments(files: MailAttachment[] = []) {
  if (files.length > 3) throw new MailError("Attach at most three files.", 413);
  let total = 0;
  return files.map((file) => {
    if (!file.name || file.name.length > 180 || file.name !== safeAttachmentName(file.name)) throw new MailError("Use a short attachment filename without path characters.");
    if (file.contentBase64.length > 1_333_336 || file.contentBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.contentBase64)) throw new MailError("An attachment is too large or has invalid encoding.", 413);
    const content = Buffer.from(file.contentBase64, "base64");
    if (content.toString("base64") !== file.contentBase64) throw new MailError("An attachment has invalid encoding.");
    total += content.length;
    if (!content.length || content.length > MAX_MAIL_FILE_BYTES || total > MAX_MAIL_TOTAL_BYTES) throw new MailError("Files must be nonempty, at most 1 MB each and 2 MB in total.", 413);
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    const types: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", csv: "text/csv" };
    const contentType = types[extension ?? ""];
    if (!contentType) throw new MailError("Attach PDF, PNG, JPEG, TXT or CSV files. Use a trusted download link for other formats.");
    const valid = extension === "pdf" ? content.subarray(0, 5).toString() === "%PDF-"
      : extension === "png" ? content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === "jpg" || extension === "jpeg" ? content.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : !content.includes(0) && Buffer.from(content.toString("utf8"), "utf8").equals(content);
    if (!valid) throw new MailError("An attachment does not match its file type. Choose the original file.");
    return { filename: file.name, content, contentType, contentDisposition: "attachment" as const };
  });
}
/** Preserve old plain-message replay hashes; bind richer requests to the exact
 * sanitized content, names, types and bytes, not merely the text fallback. */
export function mailBodyHash(input: {
  text: string; kind: string; campaignId?: string; subscriberId?: string; inReplyTo?: string;
  html?: string; attachments?: ReturnType<typeof decodeMailAttachments>;
}) {
  const identity: unknown[] = [input.text, input.kind, input.campaignId, input.subscriberId, input.inReplyTo];
  if (input.html !== undefined || input.attachments?.length) {
    identity.push(input.html ?? null, (input.attachments ?? []).map((a) => [a.filename, a.contentType, createHash("sha256").update(a.content).digest("hex")]));
  }
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

/** Stream transport builds MIME locally; it never opens a socket or loads
 * attachment paths/URLs. Both SMTP and the optional Sent copy use these bytes. */
export async function buildMailMime(input: {
  id: string; from: { name: string; address: string }; to: string; subject: string;
  text: string; html?: string; attachments?: ReturnType<typeof decodeMailAttachments>;
  unsubscribeUrl?: string; inReplyTo?: string;
}) {
  const mime = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail({
    from: input.from, to: input.to, subject: input.subject, text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${input.unsubscribeUrl}>` } } : {}),
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo, references: input.inReplyTo } : {}),
    messageId: `<${input.id}@${input.from.address.split("@")[1]}>`,
    disableFileAccess: true, disableUrlAccess: true,
  });
  if (!Buffer.isBuffer(mime.message)) throw new MailError("Email content could not be prepared.", 503);
  return mime.message;
}
