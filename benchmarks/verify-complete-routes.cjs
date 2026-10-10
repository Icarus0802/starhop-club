/* MIT. Independent correctness verifier for isolated candidate C.
 * Reference routes come only from engine.js canonical paths: no copied BFS,
 * scratch generator, transposition code, or estimated-turn objective.
 * C is tapped in a separate in-memory module to expose its visited endpoints;
 * the frozen file itself and production code are never modified.
 * Importing this file does not run searches. Run after equal-time games stop.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), Module = require('node:module');
const E = require('../js/engine.js'), A = require('../js/ai.js');
const candidateFile = path.join(__dirname, 'candidate-transport-c.cjs');
const WIN = 100000, EPSILON = 1e-7;
const id = coordinate => E.cells.findIndex((_, i) => E.coord(i) === coordinate);
const nearest = (player, cell) => Math.min(...E.zones[(player + 3) % 6].map(g => E.distances[cell][g]));
const describe = move => ({from: E.coord(move.from), to: E.coord(move.to), path: move.path.map(E.coord)});
const sorted = values => [...values].sort((a, b) => a - b);

function canonicalJumpMoves(board, from, rules) {
  return E.pieceMoves(board, from, rules).filter(move =>
    move.path.length >= 2 && move.path.slice(1).every((to, j) => E.distances[move.path[j]][to] >= 2));
}

function referenceQuality(state, player, weights = {}) {
  const w = {lag: .14, home: 2.2, done: 7, transport: 1, ...weights};
  const board = state.board, goal = (player + 3) % 6;
  const pieces = E.cells.flatMap((_, i) => board[i] === player ? [i] : []);
  const trailers = pieces.filter(i => E.zoneOf[i] !== goal);
  const distances = trailers.map(i => nearest(player, i)).sort((a, b) => b - a);
  const third = distances[Math.min(2, distances.length - 1)] ?? -1;
  const arrived = E.progress(board, player), finishing = arrived >= 6;
  const missing = E.zones[goal].filter(i => board[i] !== player);
  let lag = 0, home = 0, bridges = 0, cost = 0;
  for (const from of pieces) {
    const d = nearest(player, from); lag += d * d;
    home += Number(E.zoneOf[from] === player);
    bridges += E.adjacent[from].filter(to => to >= 0 && board[to] === player).length;
    if (!d || d <= 2 && !finishing) continue;
    const adjacent = E.adjacent[from].filter(to => to >= 0 && board[to] < 0);
    const forward = adjacent.filter(to => nearest(player, to) < d).length;
    const jumps = canonicalJumpMoves(board, from, state.rules);
    const evaluated = finishing || d >= third ? jumps : jumps.filter(move => move.path.length === 2);
    const gain = Math.max(0, ...evaluated.map(move => d - nearest(player, move.to)));
    const canEnter = E.pieceMoves(board, from, state.rules).some(move => E.zoneOf[move.to] === goal);
    if (d > 2) {
      if (!gain) cost += d * d * .045;
      if (!forward && !gain) cost += d * .65;
      if (!adjacent.length && !gain) cost += d * .9;
      cost -= Math.min(gain, 4) * .7;
    }
    if (finishing) {
      const fillDistance = Math.min(...missing.map(g => E.distances[from][g]));
      cost += Math.max(0, fillDistance - d) * .35;
      if (d <= 2 && !canEnter) cost += .75;
    }
  }
  const geometry = -A.assignment(board, player) * 10 - lag * w.lag - home * w.home + arrived * w.done + Math.min(bridges, 16) * .13;
  return {quality: geometry - cost * w.transport, geometry, transport: cost, arrived};
}

function referenceScore(state, move, weights) {
  const actor = state.players[state.turn], other = state.players[state.turn ^ 1];
  const next = E.applyMove(state, move).state;
  if (E.isWinner(next.board, actor)) return WIN;
  if (E.isWinner(next.board, other)) return -WIN;
  return referenceQuality(next, actor, weights).quality - referenceQuality(next, other, weights).quality;
}

function makeTappedCandidate(source) {
  const anchor = '    const actor=state.turn;let rootMoves=generate(actor,0).slice(),rootRestricted=false,rootAllowed=null;';
  assert.equal(source.indexOf(anchor), source.lastIndexOf(anchor), 'The inspection anchor must be unique');
  assert.ok(source.includes(anchor), 'Frozen C inspection anchor exists');
  const tap = `    if(options.verifyCompleteRoutes){
      return {sides:players.map((player,a)=>({player,quality:quality(a),pieces:Array.from(pieces[a]).filter(from=>E.zoneOf[from]!==((player+3)%6)).map(from=>{
        const gain=fullJumpGain(a,from,near[player][from]),canEnterJump=routeEntersCamp;
        const endpoints=[];for(let cell=0;cell<N;cell++)if(cell!==from&&routeMarks[cell]===routeStamp)endpoints.push(cell);
        return {from,gain,canEnterJump,endpoints};
      })}))};
    }
`;
  const sandbox = new Module(candidateFile, module); sandbox.filename = candidateFile;
  sandbox.paths = Module._nodeModulePaths(path.dirname(candidateFile));
  sandbox._compile(source.replace(anchor, tap + anchor), candidateFile);
  return sandbox.exports;
}

function verifyPosition(state, label, candidate, tapped, {timeMs = 500, clear = true} = {}) {
  const started = performance.now(), snapshot = JSON.stringify(state);
  if (clear) { candidate.clear(); tapped.clear(); }
  const inspection = tapped.search(state, {level: 4, time: timeMs, verifyCompleteRoutes: true});
  let checkedPieces = 0, checkedJumpEndpoints = 0;
  for (const side of inspection.sides) {
    const reference = referenceQuality(state, side.player);
    assert.ok(Math.abs(side.quality - reference.quality) <= EPSILON, label + ': static complete-route quality equals the independent reference');
    for (const observed of side.pieces) {
      const canonical = canonicalJumpMoves(state.board, observed.from, state.rules), d = nearest(side.player, observed.from);
      const expectedGain = Math.max(0, ...canonical.map(m => d - nearest(side.player, m.to)));
      const expectedEntry = canonical.some(m => E.zoneOf[m.to] === (side.player + 3) % 6);
      assert.deepEqual(sorted(observed.endpoints), sorted(canonical.map(m => m.to)), label + ': all jump endpoints at ' + E.coord(observed.from));
      assert.equal(observed.gain, expectedGain, label + ': maximum jump gain at ' + E.coord(observed.from));
      assert.equal(observed.canEnterJump, expectedEntry, label + ': camp entry at ' + E.coord(observed.from));
      checkedPieces++; checkedJumpEndpoints += canonical.length;
    }
  }
  const actor = state.players[state.turn];
  const enumerated = E.legalMoves(state.board, actor, state.rules).map(move => ({move, score: referenceScore(state, move)}));
  assert.ok(enumerated.length, label + ': nonempty legal root');
  const maximum = Math.max(...enumerated.map(row => row.score));
  const result = candidate.search(state, {level: 4, time: timeMs, depth: 1, selective: false});
  assert.equal(result.depth, 1, label + ': depth one must complete before checking the score');
  const selected = enumerated.find(row => row.move.from === result.move?.from && row.move.to === result.move?.to);
  assert.ok(selected, label + ': root choice is independently legal');
  assert.deepEqual(result.move.path, selected.move.path);
  assert.ok(Math.abs(result.score - maximum) <= EPSILON, label + ': completed depth-one score is the independent maximum');
  assert.ok(Math.abs(selected.score - maximum) <= EPSILON, label + ': selected endpoint attains that maximum (ties accepted)');
  for (const c of result.candidates || []) {
    const row = enumerated.find(row => row.move.from === c.from && row.move.to === c.to);
    assert.ok(row); assert.ok(Math.abs(c.score - row.score) <= EPSILON, label + ': candidate score');
  }
  assert.equal(JSON.stringify(state), snapshot, label + ': full input remains unchanged');
  return {label, jump: state.rules.jump, goalLock: state.rules.goalLock, checkedPieces, checkedJumpEndpoints,
    rootMoves: enumerated.length, best: describe(result.move), maximum, score: result.score, completedDepth: result.depth,
    timeMs: +(performance.now() - started).toFixed(3)};
}

function casesForChallenge() {
  const replay = E.replay(require('../tests/fixtures/user-challenge-95.json'));
  const make = (ply, rules = replay.states[ply].rules, turn = replay.states[ply].turn) => ({...replay.states[ply], board: replay.states[ply].board.slice(), rules: {...rules}, turn});
  const cases = [35, 41, 43, 93, 94].map(ply => ({label: 'captured-after-' + ply, state: make(ply)}));
  cases.push({label: 'long-after-43', state: make(43, {jump: 'long', goalLock: false})});
  cases.push({label: 'long-lock-after-93', state: make(93, {jump: 'long', goalLock: true})});
  cases.push({label: 'short-lock-after-93', state: make(93, {jump: 'short', goalLock: true})});
  // Red positions are unchanged across the actual green K8->J8 blocking move.
  // Reusing caches across this sequence checks the full-board route key.
  cases.push({label: 'cache-red-before-43', state: make(42, undefined, 1), clear: false});
  cases.push({label: 'cache-red-after-43', state: make(43), clear: false});
  cases.push({label: 'cache-red-before-43-again', state: make(42, undefined, 1), clear: false});
  const sourceEmpty = E.createGame({players: 2, jump: 'long'});
  sourceEmpty.board.fill(-1); E.zones[3].forEach(i => sourceEmpty.board[i] = 0); E.zones[0].forEach(i => sourceEmpty.board[i] = 3);
  sourceEmpty.board[id('N8')] = -1; sourceEmpty.board[id('I7')] = 0;
  sourceEmpty.board[id('D7')] = -1; sourceEmpty.board[id('D8')] = -1;
  sourceEmpty.board[id('H7')] = 3; sourceEmpty.board[id('H8')] = 3; sourceEmpty.turn = 1;
  cases.push({label: 'long-cycle-moving-source-empty', state: sourceEmpty});
  const lockLanding = E.createGame({players: 2, jump: 'short'});
  lockLanding.board.fill(-1); E.zones[3].forEach(i => lockLanding.board[i] = 0); E.zones[0].forEach(i => lockLanding.board[i] = 3);
  lockLanding.board[id('O7')] = -1; lockLanding.board[id('M8')] = 0;
  lockLanding.board[id('D8')] = -1; lockLanding.board[id('E9')] = 3; lockLanding.turn = 1;
  cases.push({label: 'short-enter-then-leave-unlocked', state: lockLanding});
  cases.push({label: 'short-enter-then-leave-locked', state: {...lockLanding, board: lockLanding.board.slice(), rules: {jump: 'short', goalLock: true}}});
  return cases;
}

function run(options = {}) {
  const started = performance.now(), source = fs.readFileSync(candidateFile, 'utf8');
  const candidate = require(candidateFile), tapped = makeTappedCandidate(source);
  const all = casesForChallenge(), cases = options.smoke ? all.filter(c => ['captured-after-43', 'long-cycle-moving-source-empty', 'short-enter-then-leave-locked'].includes(c.label)) : all;
  const results = [], failures = [];
  for (const c of cases) {
    try { results.push(verifyPosition(c.state, c.label, candidate, tapped, {timeMs: options.timeMs ?? 500, clear: c.clear !== false})); }
    catch (error) { failures.push({label: c.label, message: error.message, actual: error.actual, expected: error.expected}); }
  }
  return {status: failures.length ? 'failed' : 'passed', candidate: path.basename(candidateFile),
    candidateSHA256: crypto.createHash('sha256').update(source).digest('hex'),
    method: 'Stateless E.pieceMoves canonical jump endpoints and score reference; all legal one-ply roots enumerated. Only instrumentation is an in-memory readout of the frozen candidate endpoints/gain. Ties accepted. This verifies implementation consistency, not playing strength.',
    cases: cases.length, passed: results.length, failed: failures.length, results, failures,
    timeMs: +(performance.now() - started).toFixed(3)};
}

module.exports = {canonicalJumpMoves, referenceQuality, referenceScore, verifyPosition, casesForChallenge, run};
if (require.main === module) {
  const result = run({smoke: process.argv.includes('--smoke')}); console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
}
