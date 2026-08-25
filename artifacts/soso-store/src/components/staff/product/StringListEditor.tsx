import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export function StringListEditor({ 
  items, 
  onChange, 
  placeholder,
  isCode,
  testIdPrefix,
  inputLabel,
}: { 
  items: string[]; 
  onChange: (items: string[]) => void;
  placeholder?: string;
  isCode?: boolean;
  testIdPrefix: string;
  inputLabel: string;
}) {
  const [newValue, setNewValue] = useState("");

  const handleAdd = () => {
    const val = newValue.trim();
    if (val && !items.includes(val)) {
      onChange([...items, val]);
      setNewValue("");
    }
  };

  const handleRemove = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className={`flex-1 border border-border bg-background px-3 py-2 text-xs ${isCode ? "font-mono" : ""}`}>
            {item}
          </div>
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="flex h-[2.35rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
            data-testid={`${testIdPrefix}-remove-${index}`}
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{inputLabel}</span>
          <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          className={`staff-input text-xs h-[2.35rem] min-h-0 ${isCode ? "font-mono" : ""}`}
          placeholder={placeholder}
          data-testid={`${testIdPrefix}-input-new`}
          />
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newValue.trim()}
          className="flex h-[2.35rem] px-3 items-center justify-center border border-border text-primary hover:border-primary disabled:opacity-30 text-[10px] font-semibold uppercase tracking-wider"
          data-testid={`${testIdPrefix}-button-add`}
        >
          <Plus size={14} className="mr-1" /> Add
        </button>
      </div>
    </div>
  );
}
