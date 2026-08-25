import { useMemo } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2, AlertCircle } from "lucide-react";
import type { PlatformContent } from "../../data/platformContent";

type SiteData = PlatformContent["site"];

export function PlatformEditorSite({
  data,
  onChange,
  allowedTargets,
}: {
  data: SiteData;
  onChange: (data: SiteData) => void;
  allowedTargets: string[];
}) {
  const suggestions = data.header?.searchSuggestions || [];

  const updateSuggestions = (newSuggestions: { label: string; href: string }[]) => {
    onChange({
      ...data,
      header: {
        ...data.header,
        searchSuggestions: newSuggestions,
      },
    });
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === suggestions.length - 1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    const items = [...suggestions];
    const temp = items[index];
    items[index] = items[newIndex];
    items[newIndex] = temp;
    updateSuggestions(items);
  };

  const updateItem = (index: number, field: "label" | "href", value: string) => {
    const items = [...suggestions];
    items[index] = { ...items[index], [field]: value };
    updateSuggestions(items);
  };

  const removeItem = (index: number) => {
    const items = [...suggestions];
    items.splice(index, 1);
    updateSuggestions(items);
  };

  const addItem = () => {
    updateSuggestions([...suggestions, { label: "", href: "" }]);
  };

  const validateHrefs = useMemo(() => {
    const issues = new Set<string>();
    const seen = new Set<string>();
    suggestions.forEach((s) => {
      if (!s.label.trim()) issues.add("Every suggestion needs a shopper-facing label");
      if (!s.href) issues.add("Some suggestions are missing a URL path");
      else if (!allowedTargets.includes(s.href) && !s.href.startsWith("/shop?")) {
        issues.add(`Unknown or unsafe storefront target: ${s.href}`);
      }
      if (seen.has(s.href)) issues.add(`Duplicate URL path detected: ${s.href}`);
      seen.add(s.href);
    });
    return Array.from(issues);
  }, [allowedTargets, suggestions]);

  return (
    <div className="mt-5 border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Header Search Suggestions</h3>
        {validateHrefs.length > 0 && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle size={14} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{validateHrefs.length} Issue{validateHrefs.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
      
      {validateHrefs.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 p-3 text-destructive text-xs space-y-1 mb-4" data-testid="site-validation-errors">
          {validateHrefs.map((val, i) => <div key={i}>{val}</div>)}
        </div>
      )}

      <div className="space-y-4">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="flex flex-col gap-3 border border-border p-4 bg-background sm:flex-row sm:items-start" data-testid={`site-search-suggestion-${index}`}>
            <div className="flex flex-1 gap-4">
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Label</span>
                <input
                  type="text"
                  value={suggestion.label}
                  onChange={(e) => updateItem(index, "label", e.target.value)}
                  className="staff-input text-xs"
                  placeholder="e.g. New Arrivals"
                  data-testid={`input-suggestion-label-${index}`}
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL Path</span>
                <input
                  type="text"
                  value={suggestion.href}
                  onChange={(e) => updateItem(index, "href", e.target.value)}
                  className="staff-input text-xs font-mono"
                  placeholder="e.g. /collections/new"
                  data-testid={`input-suggestion-href-${index}`}
                />
              </label>
            </div>
            <div className="flex gap-2 pt-5">
              <button
                type="button"
                onClick={() => moveItem(index, "up")}
                disabled={index === 0}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                data-testid={`button-suggestion-up-${index}`}
                title="Move Up"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, "down")}
                disabled={index === suggestions.length - 1}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                data-testid={`button-suggestion-down-${index}`}
                title="Move Down"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
                data-testid={`button-suggestion-remove-${index}`}
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
          data-testid="button-suggestion-add"
        >
          <Plus size={15} /> Add Suggestion
        </button>
      </div>
    </div>
  );
}
