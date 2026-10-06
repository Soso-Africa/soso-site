// Crawler content must use the same published sources as the public FAQ/policy APIs.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

export function publishedFaqContent(rows) {
  return rows.map((row) => {
    if (!row.question?.trim() || !row.answer?.trim()) throw new Error("Invalid published FAQ");
    return { question: row.question, answer: row.answer };
  });
}

export function renderFaqContent(items) {
  return items.map((item) => `<section><h2>${escapeHtml(item.question)}</h2><p>${escapeHtml(item.answer).replace(/\n/g, "<br>")}</p></section>`).join("");
}

export function publishedPolicyPages(rows, now = Date.now()) {
  const latest = new Map();
  for (const row of rows) {
    if (row.status !== "published" || !row.effectiveAt || new Date(row.effectiveAt).getTime() > now) continue;
    if (!latest.has(row.slug) || row.version > latest.get(row.slug).version) latest.set(row.slug, row);
  }
  return [...latest.values()].map((row) => {
    const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
    if (!slugPattern.test(row.slug) || !text(row.title, 160) || !text(row.summary, 1000)
      || !Number.isInteger(row.version) || row.version < 1 || !Number.isFinite(new Date(row.effectiveAt).getTime())
      || !Array.isArray(row.sections) || !row.sections.length
      || row.sections.some((section) => !section || !slugPattern.test(section.id) || !text(section.heading, 240)
        || !(section.paragraphs?.length || section.bullets?.length)
        || (section.paragraphs !== undefined && (!Array.isArray(section.paragraphs) || !section.paragraphs.length || section.paragraphs.some((p) => !text(p, 10000))))
        || (section.bullets !== undefined && (!Array.isArray(section.bullets) || !section.bullets.length || section.bullets.some((p) => !text(p, 1000)))))) {
      throw new Error(`Invalid published policy: ${row.slug}`);
    }
    const path = ["privacy", "terms", "delivery-returns", "care"].includes(row.slug) ? `/${row.slug}` : `/policies/${row.slug}`;
    return {
      path, title: `${row.title} | SOSO Africa`, description: row.summary, h1: row.title,
      body: row.summary, lastmod: new Date(row.updatedAt || row.effectiveAt).toISOString(),
      bodyHtml: `<article><p>Version ${row.version} · Effective ${new Date(row.effectiveAt).toISOString().slice(0, 10)}</p>${row.sections.map((section) =>
        `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.heading)}</h2>${(section.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${section.bullets?.length ? `<ul>${section.bullets.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}</section>`).join("")}</article>`,
    };
  });
}

export function publishedProductImage(product) {
  // SOSO catalogue images are stored as img and/or images[].src, not image.url.
  return product.img || product.images?.find((image) => image.src)?.src || "";
}
