const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// The issue was returning text node with missing tags or missing `. I'll rewrite this small block:
content = content.replace(
  /<div aria-live="polite" className="sr-only">[\s\S]*?<\/div>/m, 
  '<div aria-live="polite" className="sr-only">{`Showing material ${activeSet.label} ${activeView} view`}</div>'
);

fs.writeFileSync(path, content);
