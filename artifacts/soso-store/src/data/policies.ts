export type PolicySection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type PolicyDocument = {
  slug: string;
  version: number;
  title: string;
  summary: string;
  sections: PolicySection[];
  effectiveAt: string;
};

export type PolicySummary = Omit<PolicyDocument, "sections">;