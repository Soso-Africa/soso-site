const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('Showing material {activeSet.label}, {activeView} view', 'Showing material {activeSet.label} {activeView} view');

fs.writeFileSync(path, content);
