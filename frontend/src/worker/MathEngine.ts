import RBush from 'rbush';
import type { BBox, InkStroke } from '../types/canvas';
import type { MathASTNode, MathOverride } from '../types/math';
import { MATH_PATHS } from '../presets/mathInk';
import { DollarPRecognizer } from './DollarPRecognizer';
import { bounds, union } from './heuristics';
import { defineFunction, evaluate, parseExpression } from './expression';
import type { Scope } from './expression';
import type { InkCluster } from './dbscan';

interface Glyph { token: string; strokes: InkStroke[]; bbox: BBox; index?: number }
interface Line { id: string; glyphs: Glyph[]; bbox: BBox }
const recognizer = new DollarPRecognizer(Object.fromEntries(Object.entries(MATH_PATHS).filter(([key]) => /^[0-9kmcwabxy+*/^()-]$/.test(key))));
const expand = (b: BBox, n: number) => ({ minX: b.minX - n, minY: b.minY - n, maxX: b.maxX + n, maxY: b.maxY + n });
const centerY = (b: BBox) => (b.minY + b.maxY) / 2;

function mathLines(strokes: InkStroke[], excluded: Set<string>): Line[] {
  const seeded = new Map<string, Map<number, InkStroke[]>>();
  for (const stroke of strokes) if (stroke.mathLineId && stroke.mathTokenIndex !== undefined && stroke.recognizedToken) {
    let line = seeded.get(stroke.mathLineId);
    if (!line) { line = new Map(); seeded.set(stroke.mathLineId, line); }
    const group = line.get(stroke.mathTokenIndex) ?? []; group.push(stroke); line.set(stroke.mathTokenIndex, group);
  }
  const lines: Line[] = [...seeded].map(([id, tokens]) => {
    const glyphs = [...tokens].sort(([a], [b]) => a - b).map(([index, group]) => ({ token: group[0].recognizedToken!, strokes: group, bbox: union(group.map((s) => s.bbox)), index }));
    return { id: `math:${id}`, glyphs, bbox: union(glyphs.map((g) => g.bbox)) };
  });
  const candidates = strokes.filter((s) => !s.mathLineId && !excluded.has(s.id) && s.semanticRole !== 'graph_weight'
    && s.bbox.maxX - s.bbox.minX <= 55 && s.bbox.maxY - s.bbox.minY <= 65);
  const tree = new RBush<BBox & { stroke: InkStroke }>(); tree.load(candidates.map((stroke) => ({ ...bounds(stroke.points), stroke })));
  const seen = new Set<string>(), equals: Glyph[] = [];
  const horizontal = (b: BBox) => b.maxX - b.minX >= 8 && b.maxY - b.minY < 4;
  // Find an equals sign before attempting expensive glyph recognition on nearby ink.
  for (const entry of tree.all()) {
    if (!horizontal(entry) || seen.has(entry.stroke.id)) continue;
    const other = tree.search(expand(entry, 18)).find((b) => !seen.has(b.stroke.id) && b.stroke.id !== entry.stroke.id && horizontal(b)
      && Math.abs(b.minX - entry.minX) < 5 && Math.abs(b.maxX - entry.maxX) < 5
      && Math.abs(centerY(b) - centerY(entry)) >= 4 && Math.abs(centerY(b) - centerY(entry)) <= 18);
    if (other) {
      const group = [entry.stroke, other.stroke]; group.forEach((s) => seen.add(s.id));
      equals.push({ token: '=', strokes: group, bbox: union(group.map((s) => s.bbox)) });
    }
  }
  for (const equal of equals) {
    const b = equal.bbox;
    const local = tree.search({ minX: b.minX - 170, maxX: b.maxX + 1500, minY: b.minY - 24, maxY: b.maxY + 24 });
    const glyphs: Glyph[] = [equal];
    const visited = new Set(seen);
    for (const entry of local) {
      if (visited.has(entry.stroke.id)) continue;
      const group = [entry.stroke]; visited.add(entry.stroke.id);
      for (let i = 0; i < group.length; i++) for (const next of tree.search(expand(bounds(group[i].points), 2))) {
        if (!visited.has(next.stroke.id)) { group.push(next.stroke); visited.add(next.stroke.id); }
      }
      const box = union(group.map((s) => s.bbox));
      const rawBox = union(group.map((s) => bounds(s.points)));
      const token = rawBox.maxX - rawBox.minX < 3 && rawBox.maxY - rawBox.minY < 3 ? '.'
        : horizontal(rawBox) ? '-' : recognizer.recognize(group.map((s) => s.points))?.token;
      glyphs.push({ token: token ?? '?', strokes: group, bbox: box });
    }
    glyphs.sort((a, b) => a.bbox.minX - b.bbox.minX);
    const row = glyphs.filter((g) => Math.abs(centerY(g.bbox) - centerY(b)) < 23);
    // Connected row containing this equals sign; large gaps delimit separate expressions.
    const at = row.indexOf(equal); let start = at, end = at;
    while (start > 0 && row[start].bbox.minX - row[start - 1].bbox.maxX < 45) start--;
    while (end + 1 < row.length && row[end + 1].bbox.minX - row[end].bbox.maxX < 45) end++;
    const connected = row.slice(start, end + 1);
    if (connected.length >= 3 && connected[0].token.match(/^[kmcwabxy]$/)) lines.push({
      id: `math:${equal.strokes.map((s) => s.id).sort()[0]}`, glyphs: connected, bbox: union(connected.map((g) => g.bbox)),
    });
  }
  return lines.sort((a, b) => Math.floor(a.bbox.minY / 40) - Math.floor(b.bbox.minY / 40) || a.bbox.minX - b.bbox.minX || a.id.localeCompare(b.id));
}

export function compileMath(strokes: InkStroke[], clusters: InkCluster[], excluded = new Set<string>(), override?: MathOverride): MathASTNode[] {
  const lines = mathLines(strokes, excluded), scope: Scope = { variables: new Map(), functions: new Map() };
  const definitions = new Map<string, string>(), nodes: MathASTNode[] = [];
  const membership = new Map(clusters.flatMap((c) => c.strokeIds.map((id) => [id, c.id] as const)));
  const workspace = (line: Line) => membership.get(line.glyphs[0].strokes[0].id) ?? line.id;
  const plotBottom = new Map<string, number>();
  for (const line of lines) plotBottom.set(workspace(line), Math.max(plotBottom.get(workspace(line)) ?? -Infinity, line.bbox.maxY + 48));
  for (const line of lines) {
    const rawExpression = line.glyphs.map((g) => g.token).join('');
    const node: MathASTNode = { kind: 'math', id: line.id, strokeIds: line.glyphs.flatMap((g) => g.strokes.map((s) => s.id)),
      bbox: line.bbox, displayBBox: { ...line.bbox, maxX: line.bbox.maxX + 130 }, rawExpression, dependencies: [] };
    let assigned: string | undefined;
    try {
      const parsed = parseExpression(rawExpression); assigned = parsed.name; node.variableName = parsed.name;
      node.dependencies = parsed.dependencies.map((name) => {
        const id = definitions.get(name);
        if (!id) throw new Error(`Unknown variable or function ${name}. Define it above this line.`);
        return id;
      });
      if (parsed.parameter) {
        const captured: Scope = { variables: new Map(scope.variables), functions: new Map(scope.functions) };
        const samples: [number, number | null][] = Array.from({ length: 200 }, (_, i) => {
          const x = i * 10 / 199;
          try { return [x, evaluate(parsed.body, { ...captured, variables: new Map([...captured.variables, [parsed.parameter!, x]]) })]; }
          catch { return [x, null]; }
        });
        const values = samples.flatMap(([, y]) => y === null ? [] : [y]);
        if (!values.length) throw new Error('This function has no finite values on 0 ≤ x ≤ 10.');
        const extent = Math.max(1, ...values.map(Math.abs));
        const y = plotBottom.get(workspace(line))!;
        const bbox = { minX: line.bbox.minX, minY: y, maxX: line.bbox.minX + 560, maxY: y + 220 };
        node.plot = { bbox, domain: [0, 10], range: [-extent, extent], samples };
        node.displayBBox = union([node.displayBBox, { ...bbox, minX: bbox.minX - 40, maxY: bbox.maxY + 24 }]);
        plotBottom.set(workspace(line), bbox.maxY + 64);
        defineFunction(parsed, scope);
      } else {
        const value = override?.nodeId === node.id && parsed.name && parsed.literal !== undefined ? override.value : evaluate(parsed.body, scope);
        if (!Number.isFinite(value)) throw new Error('Result is outside the finite number range.');
        node.numericValue = value;
        if (parsed.name && parsed.literal !== undefined && Math.abs(parsed.literal) <= 1e6) {
          const equal = line.glyphs.findIndex((g) => g.token === '=');
          node.scrubTarget = { value, valueBBox: union(line.glyphs.slice(equal + 1).map((g) => g.bbox)) };
        }
        if (parsed.name) scope.variables.set(parsed.name, value);
      }
      if (parsed.name) { definitions.set(parsed.name, node.id); if (!parsed.parameter) scope.functions.delete(parsed.name); else scope.variables.delete(parsed.name); }
    } catch (error) {
      node.error = error instanceof Error ? error.message : 'Could not evaluate this equation.';
      if (assigned) { scope.variables.delete(assigned); scope.functions.delete(assigned); definitions.delete(assigned); }
    }
    nodes.push(node);
  }
  return nodes;
}
