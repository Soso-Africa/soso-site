const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// The issue happens anywhere we do `{something} text`.
// Let's replace ALL `{...}` mixed with text inside `aria-live` with pure JS inside `{}`.

content = content.replace(
  /<div aria-live="polite" className="sr-only"><span>Showing material {activeSet\.label} <\/span><span>{activeView} view<\/span><\/div>/g, 
  '<div aria-live="polite" className="sr-only">{["Showing material ", activeSet.label, " ", activeView, " view"].join("")}</div>'
);

fs.writeFileSync(path, content);
