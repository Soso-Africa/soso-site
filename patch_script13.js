const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// The issue isn't the React syntax inside MaterialTurnStage.tsx, the issue is that in the Replit / Vite setup there's a buggy metadata injector doing regex on files and breaking on the {activeView} expression.
// Let's completely remove the `{activeSet.label} {activeView}` and use standard concat or simple text, OR `<span>` tags for safety so the regex parser doesn't choke.

content = content.replace(
  /<div aria-live="polite" className="sr-only">Showing material {activeSet\.label} {activeView} view<\/div>/g, 
  '<div aria-live="polite" className="sr-only"><span>Showing material {activeSet.label} </span><span>{activeView} view</span></div>'
);

fs.writeFileSync(path, content);
