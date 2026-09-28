import { useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

export type CommerceSearchOption = {
  id: string;
  label: string;
  searchText?: string;
};

export function CommerceSearchSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  options: CommerceSearchOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label}: ${selected?.label ?? (value ? "Previously selected item unavailable" : placeholder)}. Type to search.`}
            aria-haspopup="listbox"
            aria-expanded={open}
            data-testid={testId}
            className="staff-input flex min-h-10 w-full items-center justify-between gap-2 text-left text-xs disabled:opacity-50"
          >
            <span className="truncate">{selected?.label ?? (value ? `Previously selected item unavailable · ${value}` : placeholder)}</span>
            <ChevronsUpDown size={14} className="shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
          onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
        >
          <Command>
            <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder={`Search ${label.toLowerCase()} by name or ID…`} aria-label={`Search ${label.toLowerCase()}`} />
            <CommandList className="max-h-64">
              <CommandEmpty>No matches. Try a name or ID.</CommandEmpty>
              {value && (
                <CommandItem value="clear selection remove mapping" onSelect={() => { onChange(""); setOpen(false); }}>
                  Clear selection
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.searchText ?? ""} ${option.id}`}
                  onSelect={() => { onChange(option.id); setOpen(false); }}
                  className="flex items-start gap-2"
                >
                  <Check size={14} className={`mt-0.5 shrink-0 ${value === option.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="break-words">{option.label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !selected && <span role="alert" className="text-[10px] text-amber-700">The previously selected ID is not in the current JusticeSure catalogue. Choose a current item.</span>}
    </div>
  );
}