const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// The issue is curly braces inside a string need to be wrapped properly in JSX or we need to use {"view"} or something.
// Oh, the Replit Vite Babel plugin is crashing on something! Wait, maybe the issue is further down.

// Let's rewrite the return statement string interpolation properly
content = content.replace(
  /<div aria-live="polite" className="sr-only">Showing material {activeSet\.label}, {activeView} view<\/div>/m, 
  '<div aria-live="polite" className="sr-only">{"Showing material " + activeSet.label + ", " + activeView + " view"}</div>'
);

fs.writeFileSync(path, content);
