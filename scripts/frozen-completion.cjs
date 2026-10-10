/* MIT. Exact, resource-bounded own-turn completion on a frozen board.
 * This is a transport measurement, not an alternating-game win solver.
 * Every other color is stationary. All ten selected pieces may legally move.
 * Importing this module does not run a search or write files.
 */
'use strict';
const E = require('../js/engine.js');
const bits = E.cells.map((_, i) => 1n << BigInt(i));

class Heap {
  constructor() { this.items = []; }
  less(a, b) { return a.f < b.f || a.f === b.f && (a.rank < b.rank || a.rank === b.rank && a.g > b.g); }
  push(node) {
    const a = this.items; let i = a.length; a.push(node);
    while (i) { const p = (i - 1) >> 1; if (!this.less(node, a[p])) break; a[i] = a[p]; i = p; }
    a[i] = node;
  }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let k = i * 2 + 1; if (k + 1 < a.length && this.less(a[k + 1], a[k])) k++;
        if (!this.less(a[k], last)) break; a[i] = a[k]; i = k;
      }
      a[i] = last;
    }
    return top;
  }
  get length() { return this.items.length; }
}

function solve(state, player, options = {}) {
  const started = performance.now();
  if (!state || !state.board || state.board.length !== 121 || !Number.isInteger(player) || player < 0 || player > 5) throw new Error('Frozen completion requires a 121-hole state and a valid player');
  const board = Array.from(state.board);
  if (board.some(p => !Number.isInteger(p) || p < -1 || p > 5) || board.filter(p => p === player).length !== 10) throw new Error('Frozen completion requires exactly ten selected pieces and valid occupancy');
  const rules = {jump: state.rules?.jump === 'long' ? 'long' : 'short', goalLock: !!state.rules?.goalLock};
  const timeMs = Number(options.timeMs ?? 250), maxStates = Math.floor(Number(options.maxStates ?? 100000));
  if (!Number.isFinite(timeMs) || timeMs < 0 || !Number.isFinite(maxStates) || maxStates < 0) throw new Error('Frozen completion resource limits must be finite and nonnegative');
  const deadline = started + timeMs, goals = E.zones[(player + 3) % 6], goalZone = (player + 3) % 6;
  let expanded = 0, generated = 0, popped = 0, duplicateOrStale = 0;
  const expandedByF = {}, open = new Heap(), visited = new Map();
  const result = (status, reason = null, extra = {}) => ({
    status, solved: false, proven: false, steps: null, plan: [], reason,
    timeout: reason === 'time-limit', frozenOpponents: true, forcedGameWin: false,
    player, rules, expanded, generated, uniqueStates: visited.size, popped, duplicateOrStale,
    expandedByF: {...expandedByF}, minOpenF: open.length ? open.items[0].f : null,
    timeMs: performance.now() - started, ...extra
  });
  if (E.isWinner(board, player)) return result('solved', null, {solved: true, proven: true, steps: 0});
  // A frozen foreign piece can never vacate a required goal hole.
  if (goals.some(i => board[i] >= 0 && board[i] !== player)) return result('unreachable', 'frozen-piece-in-target', {proven: true});
  if (performance.now() >= deadline) return result('unknown', 'time-limit');
  if (maxStates === 0) return result('unknown', 'state-limit');
  const outside = b => 10 - E.progress(b, player);
  // Geometry affects ordering among equal f only; it cannot delete an edge.
  const rank = b => {
    const holes = goals.filter(i => b[i] !== player); let value = 0;
    for (let i = 0; i < 121; i++) if (b[i] === player && E.zoneOf[i] !== goalZone) {
      let d = Infinity; for (const g of holes) d = Math.min(d, E.distances[i][g]); value += d * d;
    }
    return value;
  };
  let mask = 0n; for (let i = 0; i < 121; i++) if (board[i] === player) mask |= bits[i];
  visited.set(mask, 0);
  open.push({board, mask, g: 0, f: outside(board), rank: rank(board), parent: null, move: null});
  while (open.length) {
    if (performance.now() >= deadline) return result('unknown', 'time-limit');
    const node = open.pop(); popped++;
    if (visited.get(node.mask) !== node.g) { duplicateOrStale++; continue; }
    if (E.isWinner(node.board, player)) {
      const plan = []; for (let n = node; n.parent; n = n.parent) plan.push({from: n.move.from, to: n.move.to, path: [...n.move.path]}); plan.reverse();
      // One move changes outside count by at most one; h is consistent and
      // admissible even for long jumps. A popped goal has minimum own-turn g.
      // No beam/depth/defense/arrived-piece pruning is used anywhere above.
      return result('solved', null, {solved: true, proven: true, steps: node.g, plan,
        proof: 'All legal actions; A* with admissible, consistent h=outside-goal piece count; lowest-g occupancy transpositions; geometric rank is only a tie breaker.'});
    }
    expanded++; expandedByF[node.f] = (expandedByF[node.f] || 0) + 1;
    const moves = E.legalMoves(node.board, player, rules);
    for (const move of moves) {
      if ((generated & 31) === 0 && performance.now() >= deadline) return result('unknown', 'time-limit');
      generated++;
      const g = node.g + 1, nextMask = node.mask ^ bits[move.from] ^ bits[move.to], old = visited.get(nextMask);
      if (old !== undefined && old <= g) { duplicateOrStale++; continue; }
      if (old === undefined && visited.size >= maxStates) return result('unknown', 'state-limit');
      const next = node.board.slice(); next[move.from] = -1; next[move.to] = player;
      visited.set(nextMask, g);
      open.push({board: next, mask: nextMask, g, f: g + outside(next), rank: rank(next), parent: node, move});
    }
  }
  return result('unreachable', 'graph-exhausted', {proven: true});
}

module.exports = {solve};
