const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// The issue is curly braces for the string need to be wrapped properly
content = content.replace(
  /<div aria-live="polite" className="sr-only">Showing material {activeSet.label}, {activeView} view<\/div>/m, 
  '<div aria-live="polite" className="sr-only">Showing material {activeSet.label}, {activeView} view</div>'
);

fs.writeFileSync(path, content);
