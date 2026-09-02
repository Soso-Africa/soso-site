const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /<div aria-live="polite" className="sr-only">\s*Showing material {activeSet\.label}, {activeView} view\s*<\/div>/g, 
  '<div aria-live="polite" className="sr-only">Showing material</div>'
);

fs.writeFileSync(path, content);
