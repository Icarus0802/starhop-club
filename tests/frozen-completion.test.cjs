'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const E = require('../js/engine.js'), {solve} = require('../scripts/frozen-completion.cjs');
const challenge = require('./fixtures/user-challenge-95.json');
const cell = name => E.cells.findIndex((_, i) => E.coord(i) === name);

function verify(state, player, result) {
  assert.equal(result.solved, true); assert.equal(result.proven, true);
  assert.equal(result.steps, result.plan.length);
  const b = state.board.slice();
  for (const move of result.plan) {
    assert.equal(b[move.from], player);
    const legal = E.pieceMoves(b, move.from, state.rules).find(m => m.to === move.to);
    assert.ok(legal, 'Solver move is legal under the selected jump/goal-lock rules');
    assert.deepEqual(move.path, legal.path);
    b[move.from] = -1; b[move.to] = player;
    for (let i = 0; i < 121; i++) if (state.board[i] >= 0 && state.board[i] !== player) assert.equal(b[i], state.board[i], 'Every other player stays frozen');
  }
  assert.ok(E.isWinner(b, player)); return b;
}

test('captured terminal challenge: exact frozen red completion costs five own turns, without changing the finished game', () => {
  const {state} = E.replay(challenge), snapshot = JSON.stringify(state);
  assert.equal(state.ply, 95); assert.equal(state.winner, 3);
  const r = solve(state, 0, {timeMs: 2000, maxStates: 100000});
  verify(state, 0, r); assert.equal(r.steps, 5);
  for (const f of [2, 3, 4]) assert.ok(r.expandedByF[f] > 0, 'Search examined lower-bound layers below five');
  assert.ok(r.minOpenF >= r.steps);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(state.winner, 3); assert.equal(E.progress(state.board, 0), 8);
  assert.equal(r.forcedGameWin, false);
});

test('resource deadline reports unknown and never turns a partial route into a minimum', () => {
  const {state} = E.replay(challenge), r = solve(state, 0, {timeMs: 0});
  assert.equal(r.status, 'unknown'); assert.equal(r.reason, 'time-limit'); assert.equal(r.timeout, true);
  assert.equal(r.solved, false); assert.equal(r.proven, false); assert.equal(r.steps, null); assert.deepEqual(r.plan, []);
});

test('state cap also reports unknown with no claimed minimum', () => {
  const {state} = E.replay(challenge), r = solve(state, 0, {timeMs: 2000, maxStates: 1});
  assert.equal(r.status, 'unknown'); assert.equal(r.reason, 'state-limit'); assert.equal(r.timeout, false);
  assert.equal(r.uniqueStates, 1); assert.equal(r.solved, false); assert.equal(r.proven, false); assert.equal(r.steps, null); assert.deepEqual(r.plan, []);
});

test('already completed side is proven zero even when no search budget remains', () => {
  const {state} = E.replay(challenge), r = solve(state, 3, {timeMs: 0, maxStates: 0});
  assert.equal(r.status, 'solved'); assert.equal(r.steps, 0); assert.equal(r.proven, true); assert.deepEqual(r.plan, []);
});

test('one neighboring empty goal hole completes in one adjacent step', () => {
  const {state} = E.replay(require('./fixtures/master-huaxia-jiuxiao-2019.json'));
  const r = solve(state, 0, {timeMs: 2000}); verify(state, 0, r);
  assert.equal(r.steps, 1); assert.deepEqual(r.plan[0].path.map(E.coord), ['M8', 'N8']);
  assert.equal(E.distances[r.plan[0].from][r.plan[0].to], 1);
});

test('long jump can cross a distant bridge in one turn, while short rules cannot use that leap', () => {
  const state = E.createGame({players: 2, jump: 'short'});
  state.board.fill(-1); E.zones[3].forEach(i => state.board[i] = 0); E.zones[0].forEach(i => state.board[i] = 3);
  state.board[cell('N8')] = -1; state.board[cell('J6')] = 0;
  state.board[cell('D8')] = -1; state.board[cell('L7')] = 3;
  const short = solve(state, 0, {timeMs: 2000}); verify(state, 0, short);
  assert.ok(short.steps > 1);
  assert.equal(E.pieceMoves(state.board, cell('J6'), state.rules).some(m => m.to === cell('N8')), false);
  const longState = {...state, rules: {jump: 'long', goalLock: false}};
  const long = solve(longState, 0, {timeMs: 2000}); verify(longState, 0, long);
  assert.equal(long.steps, 1); assert.deepEqual(long.plan[0].path.map(E.coord), ['J6', 'N8']);
  assert.equal(E.distances[long.plan[0].from][long.plan[0].to], 4);
});

test('frozen foreign occupation of a required hole is proven unreachable, not a timeout', () => {
  const state = E.createGame({players: 2}), r = solve(state, 0, {timeMs: 2000});
  assert.equal(r.status, 'unreachable'); assert.equal(r.reason, 'frozen-piece-in-target');
  assert.equal(r.proven, true); assert.equal(r.solved, false); assert.equal(r.steps, null);
});
