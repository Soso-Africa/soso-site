import journalSeoData from "./journal-seo.json";

export type ApprovedJournalSeoEntry = {
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  publishedAt: string;
  coverImageUrl?: string | null;
};

export const approvedJournalEntries = journalSeoData.articles as ApprovedJournalSeoEntry[];

export function approvedJournalEntryForSlug(slug: string) {
  return approvedJournalEntries.find((article) => article.slug === slug);
}