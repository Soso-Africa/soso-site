const fs = require('fs');
const path = 'artifacts/soso-store/src/pages/ProductDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add MaterialTurnStage import at the top
if (!content.includes('import { MaterialTurnStage }')) {
  content = content.replace('import { WhatsAppIcon } from "@/components/Icons";', 'import { WhatsAppIcon } from "@/components/Icons";\nimport { MaterialTurnStage } from "@/components/MaterialTurnStage";');
}

fs.writeFileSync(path, content);
