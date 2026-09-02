const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Using standard React interpolation
content = content.replace(
  /<div aria-live="polite" className="sr-only">[\s\S]*?<\/div>/m, 
  '<div aria-live="polite" className="sr-only">Showing material {activeSet.label} {activeView}</div>'
);

fs.writeFileSync(path, content);
