const fs = require('fs');
const path = 'artifacts/soso-store/src/components/MaterialTurnStage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Aaaah it's failing because there is ANOTHER string causing problems further down!
// Let's use pure syntax check to find out. 

// The syntax error shows this line: ].join("")}</div>
// It's the `</div>`!

// Wait, the Vite/Babel plugin might just be totally broken parsing backticks in my `totalStates * 100` string?
// Let's remove ALL backticks from JSX className/style and use simple strings.

content = content.replace(
  /style=\{\{ height: \`\$\{totalStates \* 100\}vh\` \}\}/g,
  'style={{ height: (totalStates * 100) + "vh" }}'
);

content = content.replace(
  /id=\{\`turn-img-wrap-\$\{set\.id\}-\$\{view\}\`\}/g,
  'id={"turn-img-wrap-" + set.id + "-" + view}'
);

content = content.replace(
  /key=\{\`\$\{set\.id\}-\$\{view\}\`\}/g,
  'key={set.id + "-" + view}'
);

content = content.replace(
  /data-testid=\{\`button-turn-stage-thumb-\$\{set\.id\}\`\}/g,
  'data-testid={"button-turn-stage-thumb-" + set.id}'
);

content = content.replace(
  /aria-label=\{\`View \$\{set\.label\}\`\}/g,
  'aria-label={"View " + set.label}'
);

content = content.replace(
  /className=\{\`px-4 py-2 text-\[10px\] font-bold tracking-\[0\.2em\] uppercase backdrop-blur-sm transition-all border \$\{activeView === "front" \? "bg-foreground text-background border-foreground" : "bg-background\/90 text-foreground border-border hover:bg-background"\}\`\}/g,
  'className={"px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase backdrop-blur-sm transition-all border " + (activeView === "front" ? "bg-foreground text-background border-foreground" : "bg-background/90 text-foreground border-border hover:bg-background")}'
);
content = content.replace(
  /className=\{\`px-4 py-2 text-\[10px\] font-bold tracking-\[0\.2em\] uppercase backdrop-blur-sm transition-all border \$\{activeView === "back" \? "bg-foreground text-background border-foreground" : "bg-background\/90 text-foreground border-border hover:bg-background"\}\`\}/g,
  'className={"px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase backdrop-blur-sm transition-all border " + (activeView === "back" ? "bg-foreground text-background border-foreground" : "bg-background/90 text-foreground border-border hover:bg-background")}'
);

content = content.replace(
  /el\.style\.transform = \`translateX\(\$\{dist > 0 \? -5 : 5\}%\) rotateY\(\$\{dist > 0 \? -70 : 70\}deg\)\`;/g,
  'el.style.transform = "translateX(" + (dist > 0 ? -5 : 5) + "%) rotateY(" + (dist > 0 ? -70 : 70) + "deg)";'
);

content = content.replace(
  /el\.style\.transform = \`translateX\(\$\{translateX\}%\) translateY\(\$\{translateY\}%\) scale\(\$\{scale\}\) rotateY\(\$\{rotateY\}deg\)\`;/g,
  'el.style.transform = "translateX(" + translateX + "%) translateY(" + translateY + "%) scale(" + scale + ") rotateY(" + rotateY + "deg)";'
);

fs.writeFileSync(path, content);
