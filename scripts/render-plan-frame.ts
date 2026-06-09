// Builds the use_figma payload for the plan frame and applies the MCP result back to state.
// The skill is responsible for actually invoking the MCP — this module is pure transform.
import { loadState, type State } from '../src/state.js';

export interface BuildOpts {
  round: number;
  pageName: string;
}

export interface FrameResult {
  pageId: string;
  frameId: string;
  frameName: string;
  rows: Array<{ itemId: string; index: number }>;
}

function escapeForTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

export function buildPlanFramePayload(state: State, opts: BuildOpts): string {
  const round = state.rounds[String(opts.round)];
  if (!round) throw new Error(`No round data for round ${opts.round}`);
  const rows = round.plan.map((item, index) => ({
    id: item.id,
    index,
    text: escapeForTemplate(item.change),
    theme: escapeForTemplate(item.themeName),
  }));
  const rowsJson = JSON.stringify(rows);
  return `
const pageName = \`${escapeForTemplate(opts.pageName)}\`;
const rows = ${rowsJson};
let page = figma.root.children.find(p => p.name === pageName);
if (!page) { page = figma.createPage(); page.name = pageName; }
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

const frame = figma.createFrame();
frame.name = \`Plan — Round ${opts.round}\`;
frame.layoutMode = 'VERTICAL';
frame.itemSpacing = 8;
frame.paddingTop = 24; frame.paddingBottom = 24; frame.paddingLeft = 24; frame.paddingRight = 24;
frame.resize(720, 100);
frame.primaryAxisSizingMode = 'AUTO';
frame.counterAxisSizingMode = 'FIXED';

const title = figma.createText();
title.fontName = { family: 'Inter', style: 'Semi Bold' };
title.fontSize = 18;
title.characters = \`Plan — Round ${opts.round}\`;
frame.appendChild(title);

const rowResults = [];
for (const r of rows) {
  const rowFrame = figma.createFrame();
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.itemSpacing = 12;
  rowFrame.paddingTop = 8; rowFrame.paddingBottom = 8; rowFrame.paddingLeft = 12; rowFrame.paddingRight = 12;
  rowFrame.primaryAxisSizingMode = 'FIXED';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.resize(672, 40);
  rowFrame.name = \`Item \${r.index + 1}\`;
  const num = figma.createText();
  num.fontName = { family: 'Inter', style: 'Semi Bold' };
  num.fontSize = 14;
  num.characters = \`\${r.index + 1}.\`;
  rowFrame.appendChild(num);
  const text = figma.createText();
  text.fontName = { family: 'Inter', style: 'Regular' };
  text.fontSize = 14;
  text.characters = r.text;
  rowFrame.appendChild(text);
  frame.appendChild(rowFrame);
  rowResults.push({ itemId: r.id, index: r.index, nodeId: rowFrame.id });
}

page.appendChild(frame);

return JSON.stringify({ pageId: page.id, frameId: frame.id, frameName: frame.name, rows: rowResults });
`.trim();
}

export function applyPlanFrameResult(state: State, round: number, result: FrameResult): State {
  const next: State = JSON.parse(JSON.stringify(state));
  const r = next.rounds[String(round)];
  if (!r) throw new Error(`No round data for round ${round}`);
  r.planFrame = { pageId: result.pageId, frameId: result.frameId, frameName: result.frameName };
  const indexById = new Map(result.rows.map((row) => [row.itemId, row.index]));
  for (const item of r.plan) {
    const idx = indexById.get(item.id);
    if (idx !== undefined) item.rowIndex = idx;
  }
  return next;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg] = process.argv;
  if (!statePath || !roundArg) {
    console.error('Usage: render-plan-frame.ts <statePath> <round>');
    process.exit(1);
  }
  const state = loadState(statePath);
  const round = parseInt(roundArg, 10);
  const pageName = `Plan — Round ${round}`;
  process.stdout.write(buildPlanFramePayload(state, { round, pageName }));
}
