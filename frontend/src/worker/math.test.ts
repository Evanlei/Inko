import { describe, expect, it } from 'vitest';
import { expressionInk, oscillatorLab } from '../presets/mathInk';
import { parseExpression, evaluate } from './expression';
import { compileMath } from './MathEngine';
import { InkClustering } from './dbscan';
import { summarize } from './semantic';
import type { InkStroke } from '../types/canvas';

const scalar = (text: string) => evaluate(parseExpression(text).body, { variables: new Map(), functions: new Map() });
const ink = (lines: string[]) => lines.flatMap((line, i) => expressionInk(line, { x: 0, y: i * 60 }, `line${i}`));
const compile = (strokes: InkStroke[]) => compileMath(strokes, new InkClustering().update(strokes, []));

describe('bounded arithmetic parser', () => {
  it.each([['2+3*4', 14], ['(2+3)*4', 20], ['2^3^2', 512], ['-2^2', -4], ['2^-2', 0.25],
    ['sqrt(9)+abs(-2)', 5], ['max(2,3)+min(4,7)', 7], ['cos(pi)+log(e)', 0], ['1e2 + .5', 100.5]])('evaluates %s', (text, expected) => {
    expect(scalar(text)).toBeCloseTo(expected);
  });
  it.each(['1/0', 'sqrt(-1)', 'exp(1000)', 'sin(1,2)', 'constructor(1)', 'x+1', 'sin()', '2(3)', 'window.x', '1;alert(1)', '', '2+', '('.repeat(50) + '1' + ')'.repeat(50)])('rejects invalid or unsafe expression %s', (text) => {
    expect(() => scalar(text)).toThrow();
  });
  it('rejects reserved assignments and oversized expressions', () => {
    expect(() => parseExpression('pi=3')).toThrow(/reserved/);
    expect(() => parseExpression('a'.repeat(161))).toThrow(/160/);
  });
});
describe('spatial math compilation', () => {
  it('compiles the oscillator, samples 200 points, and updates dependent formulas through a literal override', () => {
    const strokes = oscillatorLab({ x: 0, y: 0 }), saved = JSON.stringify(strokes), clusters = new InkClustering().update(strokes, []);
    const nodes = compileMath(strokes, clusters), k = nodes[0];
    expect(nodes.map((n) => n.error)).toEqual([undefined, undefined, undefined, undefined]);
    expect(nodes[2].numericValue).toBe(2); expect(nodes[2].dependencies).toEqual([k.id]);
    expect(nodes[3].plot?.samples).toHaveLength(200); expect(nodes[3].plot?.samples[0]).toEqual([0, 1]);
    const preview = compileMath(strokes, clusters, undefined, { nodeId: k.id, value: 9 });
    expect(preview[2].numericValue).toBe(3); expect(preview[3].plot?.samples[50][1]).not.toBe(nodes[3].plot?.samples[50][1]);
    expect(JSON.stringify(strokes)).toBe(saved);
    const summary = summarize(clusters, null, preview);
    expect(summary).toHaveLength(1); expect(summary[0].category).toBe('math_workspace'); expect(summary[0].sparkline).toHaveLength(200);
  });
  it('resolves definitions in spatial order rather than stroke arrival order', () => {
    const strokes = ink(['k=4', 'm=2', 'w=sqrt(k/m)']);
    expect(compile([...strokes].reverse()).map((n) => n.numericValue)).toEqual([4, 2, Math.sqrt(2)]);
  });
  it('reports forward references and cycles without poisoning unrelated equations', () => {
    const nodes = compile(ink(['a=b+1', 'b=a+1', 'k=3', 'm=k*2']));
    expect(nodes[0].error).toMatch(/Unknown/); expect(nodes[1].error).toMatch(/Unknown/);
    expect(nodes[3].numericValue).toBe(6);
  });
  it('supports causal redefinition and user functions with captured prior definitions', () => {
    const nodes = compile(ink(['k=2', 'f(x)=k*x', 'k=3', 'a=f(4)', 'g(x)=f(x)+k']));
    expect(nodes[3].numericValue).toBe(8);
    expect(nodes[4].plot?.samples.at(-1)).toEqual([10, 23]);
  });
  it('does not silently reuse an old value after an invalid redefinition', () => {
    const nodes = compile(ink(['k=2', 'k=1/0', 'a=k*2']));
    expect(nodes[1].error).toMatch(/undefined/); expect(nodes[2].error).toMatch(/Unknown/);
  });
  it('represents domain gaps without NaNs and rejects completely undefined functions', () => {
    const nodes = compile(ink(['y(x)=sqrt(x-5)', 'f(x)=sqrt(-1)']));
    expect(nodes[0].plot?.samples[0][1]).toBeNull(); expect(nodes[0].plot?.samples.at(-1)?.[1]).toBeCloseTo(Math.sqrt(5));
    expect(nodes[1].error).toMatch(/no finite/); expect(JSON.stringify(nodes)).not.toContain('NaN');
  });
  it('keeps deleted expressions out of the AST, reports dangling dependencies, and restores on undo', () => {
    const strokes = ink(['k=4', 'w=sqrt(k)']);
    expect(compile(strokes.filter((s) => s.mathLineId !== 'line0'))[0].error).toMatch(/Unknown/);
    expect(compile(strokes)[1].numericValue).toBe(2);
    expect(compile([])).toEqual([]);
  });
  it('recognizes a simple handwritten assignment without seeded tokens', () => {
    const strokes = ink(['k=4']).map((s) => ({ ...s, semanticRole: 'raw' as const, mathLineId: undefined, mathTokenIndex: undefined, recognizedToken: undefined }));
    const nodes = compile(strokes);
    expect(nodes).toHaveLength(1); expect(nodes[0].rawExpression).toBe('k=4'); expect(nodes[0].numericValue).toBe(4);
    expect(nodes[0].scrubTarget).toBeDefined();
  });
});
