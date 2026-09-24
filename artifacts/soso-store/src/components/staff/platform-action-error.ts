export function platformActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const data = error && typeof error === "object" && "data" in error ? error.data : null;
  const issues = data && typeof data === "object" && "issues" in data && Array.isArray(data.issues)
    ? data.issues as unknown[]
    : [];
  const details = issues.map((issue) => {
    if (typeof issue === "string") return issue;
    if (issue && typeof issue === "object" && "message" in issue && typeof issue.message === "string") {
      const path = "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : "";
      return `${path ? `${path}: ` : ""}${issue.message}`;
    }
    return "";
  }).filter(Boolean);
  return `${message}${details.length ? ` — ${details.join("; ")}` : ""}`;
}