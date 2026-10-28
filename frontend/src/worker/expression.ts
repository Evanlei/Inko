type Expr = { kind: 'number'; value: number } | { kind: 'name'; name: string }
  | { kind: 'unary'; op: string; value: Expr } | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] };
export interface ParsedExpression { name?: string; parameter?: string; body: Expr; literal?: number; dependencies: string[] }
interface Fn { parameter: string; body: Expr; scope: Scope }
export interface Scope { variables: Map<string, number>; functions: Map<string, Fn> }
const builtins: Record<string, { arity: number; run: (...args: number[]) => number }> = {
  sin: { arity: 1, run: Math.sin }, cos: { arity: 1, run: Math.cos }, tan: { arity: 1, run: Math.tan },
  exp: { arity: 1, run: Math.exp }, sqrt: { arity: 1, run: Math.sqrt }, log: { arity: 1, run: Math.log },
  abs: { arity: 1, run: Math.abs }, min: { arity: 2, run: Math.min }, max: { arity: 2, run: Math.max },
};
const constants = new Map([['pi', Math.PI], ['e', Math.E]]);
const own = (name: string) => Object.hasOwn(builtins, name) ? builtins[name] : undefined;

/** Small bounded arithmetic parser. No eval, Function constructor, property access, or JavaScript execution. */
export function parseExpression(text: string): ParsedExpression {
  if (!text.trim() || text.length > 160) throw new Error('Use an equation of 1–160 characters.');
  let source = text.trim(), name: string | undefined, parameter: string | undefined;
  const assignment = source.match(/^([a-z][a-z0-9_]{0,23})(?:\(([a-z])\))?\s*=\s*(.+)$/);
  if (assignment) {
    [, name, parameter, source] = assignment;
    if (own(name) || constants.has(name)) throw new Error(`${name} is reserved.`);
  }
  const tokens: string[] = [];
  while (source.length) {
    const token = source.match(/^\s*(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[a-z][a-z0-9_]*|[+\-*/^(),])/);
    if (!token) { if (!source.trim()) break; throw new Error('Use numbers, variables, functions, and + − * / ^ ( ).'); }
    tokens.push(token[1]); source = source.slice(token[0].length);
    if (tokens.length > 128) throw new Error('This equation is too complex.');
  }
  let cursor = 0, depth = 0;
  const dependencies = new Set<string>();
  function parse(minimum = 0): Expr {
    if (++depth > 48) throw new Error('Too many nested expressions.');
    const token = tokens[cursor++];
    let left: Expr;
    if (token === '+' || token === '-') left = { kind: 'unary', op: token, value: parse(3) };
    else if (token === '(') { left = parse(); if (tokens[cursor++] !== ')') throw new Error('Missing closing parenthesis.'); }
    else if (token && /^(?:\d|\.)/.test(token)) {
      const value = Number(token); if (!Number.isFinite(value)) throw new Error('Number is out of range.');
      left = { kind: 'number', value };
    } else if (token && /^[a-z]/.test(token)) {
      if (tokens[cursor] === '(') {
        cursor++; const args: Expr[] = [];
        if (tokens[cursor] !== ')') { args.push(parse()); while (tokens[cursor] === ',') { cursor++; args.push(parse()); } }
        if (tokens[cursor++] !== ')') throw new Error('Missing closing parenthesis.');
        if (!own(token)) dependencies.add(token);
        left = { kind: 'call', name: token, args };
      } else {
        if (!constants.has(token) && token !== parameter) dependencies.add(token);
        left = { kind: 'name', name: token };
      }
    } else throw new Error('Expected a number, variable, or parenthesis.');
    while (cursor < tokens.length) {
      const op = tokens[cursor], precedence = op === '+' || op === '-' ? 1 : op === '*' || op === '/' ? 2 : op === '^' ? 4 : -1;
      if (precedence < minimum) break;
      cursor++; left = { kind: 'binary', op, left, right: parse(precedence + (op === '^' ? 0 : 1)) };
    }
    depth--; return left;
  }
  const body = parse();
  if (cursor !== tokens.length) throw new Error(`Unexpected token ${tokens[cursor]}. Use * for multiplication.`);
  const literal = body.kind === 'number' ? body.value : body.kind === 'unary' && body.value.kind === 'number' ? (body.op === '-' ? -1 : 1) * body.value.value : undefined;
  return { name, parameter, body, literal, dependencies: [...dependencies] };
}
export function evaluate(expr: Expr, scope: Scope, depth = 0): number {
  if (depth > 64) throw new Error('Function calls are too deeply nested.');
  const child = (node: Expr) => evaluate(node, scope, depth + 1);
  let value: number;
  switch (expr.kind) {
    case 'number': value = expr.value; break;
    case 'name': {
      const found = scope.variables.get(expr.name) ?? constants.get(expr.name);
      if (found === undefined) throw new Error(`Unknown variable ${expr.name}. Define it above this line.`);
      value = found; break;
    }
    case 'unary': value = (expr.op === '-' ? -1 : 1) * child(expr.value); break;
    case 'binary': {
      const a = child(expr.left), b = child(expr.right);
      value = expr.op === '+' ? a + b : expr.op === '-' ? a - b : expr.op === '*' ? a * b : expr.op === '/' ? a / b : a ** b;
      break;
    }
    case 'call': {
      const builtin = own(expr.name), fn = scope.functions.get(expr.name), args = expr.args.map(child);
      if (!builtin && !fn) throw new Error(`Unknown function ${expr.name}. Define it above this line.`);
      if (args.length !== (builtin?.arity ?? 1)) throw new Error(`${expr.name} expects ${builtin?.arity ?? 1} argument(s).`);
      value = builtin ? builtin.run(...args) : evaluate(fn!.body, { ...fn!.scope, variables: new Map([...fn!.scope.variables, [fn!.parameter, args[0]]]) }, depth + 1);
      break;
    }
  }
  if (!Number.isFinite(value)) throw new Error('Result is undefined or outside the finite number range.');
  return value;
}
export function defineFunction(parsed: ParsedExpression, scope: Scope) {
  scope.functions.set(parsed.name!, { parameter: parsed.parameter!, body: parsed.body,
    scope: { variables: new Map(scope.variables), functions: new Map(scope.functions) } });
}
