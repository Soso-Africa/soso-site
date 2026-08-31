import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

const labelClass = "block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function isLongCopy(key: string) {
  return /(body|description|intro|message|guidance|help|note|placeholder|paragraph|prompt|reassurance|error)/i.test(key);
}

function emptyItemFrom(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, emptyItemFrom(item)]));
  }
  return "";
}

export function PlatformCopyFields({
  value,
  onChange,
  path = [],
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  path?: string[];
}) {
  if (typeof value === "string") {
    const key = path[path.length - 1] ?? "Copy";
    return <label className={labelClass}>
      {humanize(key)}
      {isLongCopy(key)
        ? <textarea rows={3} className="staff-input mt-1 normal-case tracking-normal" value={value} onChange={(event) => onChange(event.target.value)} />
        : <input className="staff-input mt-1 normal-case tracking-normal" value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>;
  }
  if (typeof value === "number") {
    return <label className={labelClass}>{humanize(path[path.length - 1] ?? "Value")}<input type="number" className="staff-input mt-1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
  }
  if (typeof value === "boolean") {
    return <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{humanize(path[path.length - 1] ?? "Enabled")}</label>;
  }
  if (Array.isArray(value)) {
    return <div className="space-y-3">
      {value.map((item, index) => <div key={index} className="border border-border bg-background p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{humanize(path[path.length - 1] ?? "Item")} {index + 1}</p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
              className="flex h-8 w-8 items-center justify-center border border-border disabled:opacity-30"
              aria-label={`Move ${humanize(path[path.length - 1] ?? "item")} ${index + 1} up`}
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              disabled={index === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[index], next[index + 1]] = [next[index + 1], next[index]];
                onChange(next);
              }}
              className="flex h-8 w-8 items-center justify-center border border-border disabled:opacity-30"
              aria-label={`Move ${humanize(path[path.length - 1] ?? "item")} ${index + 1} down`}
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              className="flex h-8 w-8 items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
              aria-label={`Remove ${humanize(path[path.length - 1] ?? "item")} ${index + 1}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <PlatformCopyFields value={item} path={[...path, String(index + 1)]} onChange={(updated) => {
          const next = [...value];
          next[index] = updated;
          onChange(next);
        }} />
      </div>)}
      <button
        type="button"
        onClick={() => onChange([...value, emptyItemFrom(value.at(-1))])}
        className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
      >
        <Plus size={13} /> Add {humanize(path[path.length - 1] ?? "item")}
      </button>
    </div>;
  }
  if (value && typeof value === "object") {
    return <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(value).map(([key, item]) => {
        const content = <PlatformCopyFields value={item} path={[...path, key]} onChange={(updated) => onChange({ ...value, [key]: updated })} />;
        if (item && typeof item === "object") {
          return <fieldset key={key} className="col-span-full border border-border bg-muted/5 p-3">
            <legend className="px-1 text-xs font-semibold">{humanize(key)}</legend>
            {content}
          </fieldset>;
        }
        return <div key={key}>{content}</div>;
      })}
    </div>;
  }
  return null;
}

export function CopyPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <details className="border border-border bg-card p-4">
    <summary className="cursor-pointer font-semibold">{title}</summary>
    {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
    <div className="mt-4">{children}</div>
  </details>;
}