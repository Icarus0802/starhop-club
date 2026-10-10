'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), {createRequire} = require('node:module');
const R = require('../js/engine.js'), baseline = require('../benchmarks/candidate-history-e.cjs');
const G = require('../benchmarks/candidate-history-order-g.cjs');
const replay = R.replay(require('./fixtures/user-challenge-95.json'));
const endpoints = moves => moves.map(m => m.from * 128 + m.to).sort((a, b) => a - b);
const positions = [
  {label: 'initial short', state: R.createGame({players: 2, jump: 'short'})},
  {label: 'captured blockade after 65', state: replay.states[65]},
  {label: 'captured late position after 85 with long/goal lock', state: {...replay.states[85], board: replay.states[85].board.slice(), rules: {jump: 'long', goalLock: true}}}
];
const subjects = [{name: 'frozen G', engine: G, filename: require.resolve('../benchmarks/candidate-history-order-g.cjs')}];
// Opt in after production adopts G: the same invariants then test the actual
// shipping module as well as the frozen candidate, against the same E control.
if (process.env.STARHOP_TEST_PRODUCTION_ROOT_ORDER === '1') subjects.push({name: 'production', engine: require('../js/fast-search.js'), filename: require.resolve('../js/fast-search.js')});

function assertLegal(state, result) {
  const legal = R.legalMoves(state.board, state.players[state.turn], state.rules);
  const selected = legal.find(m => m.from === result.move?.from && m.to === result.move?.to);
  assert.ok(selected, 'A complete or interrupted search retains a legal root');
  assert.deepEqual(Array.from(result.move.path), selected.path, 'Canonical path agrees with all jump/lock constraints');
}

function withClock(filename, now) {
  const context = {module: {exports: {}}, require: createRequire(filename), performance: {now}};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, {filename});
  return context.module.exports;
}

for (const subject of subjects) {
  test(subject.name + ': nonselective PVS depth 2/3 agrees with E on full root sets and immutable inputs', () => {
    for (const {label, state} of positions) for (const depth of [2, 3]) {
      const snapshot = JSON.stringify(state), legal = R.legalMoves(state.board, state.players[state.turn], state.rules);
      baseline.clear(); subject.engine.clear();
      assert.deepEqual(endpoints(subject.engine.search(state, {level: 4, time: 15, legalMovesOnly: true}).moves), endpoints(legal), label);
      const options = {level: 4, time: 2000, depth, selective: false, pvs: true};
      const before = baseline.search(state, options), ordered = subject.engine.search(state, options);
      assert.equal(before.depth, depth, label); assert.equal(ordered.depth, depth, label);
      assert.ok(Math.abs(before.score - ordered.score) < 1e-7, label + ': ordering changes cannot alter completed full-width scores');
      assertLegal(state, before); assertLegal(state, ordered);
      assert.equal(JSON.stringify(state), snapshot, label + ': every input field remains unchanged');
    }
  });

  test(subject.name + ': a valid shortlist constrains roots without changing exact shallow score or bound labels', () => {
    const state = replay.states[65], snapshot = JSON.stringify(state);
    const legal = R.legalMoves(state.board, state.players[state.turn], state.rules);
    const allowed = [legal[0], legal[Math.floor(legal.length / 2)], legal.at(-1)];
    const options = {level: 4, time: 2000, depth: 3, selective: false, rootMoves: [...allowed, allowed[0], {from: -1, to: -1}]};
    baseline.clear(); subject.engine.clear();
    const before = baseline.search(state, options), ordered = subject.engine.search(state, options);
    assert.equal(ordered.depth, 3); assert.ok(Math.abs(before.score - ordered.score) < 1e-7);
    assert.equal(ordered.rootRestricted, true); assert.equal(ordered.solved, false);
    assert.ok(allowed.some(m => m.from === ordered.move.from && m.to === ordered.move.to));
    for (const c of ordered.candidates) {
      assert.ok(allowed.some(m => m.from === c.from && m.to === c.to));
      assert.ok(c.bound === 'exact' || c.bound === 'upper', 'Ordering evidence never fabricates an exact flag');
    }
    assertLegal(state, ordered); assert.equal(JSON.stringify(state), snapshot);
  });

  test(subject.name + ': shortlist and ordering cannot conceal the actual immediate win at ply 95', () => {
    const state = replay.states[94], winner = replay.moves[94];
    const other = R.legalMoves(state.board, state.players[state.turn], state.rules).find(m => m.to !== winner.to);
    assert.ok(other); subject.engine.clear();
    const result = subject.engine.search(state, {level: 4, time: 15, rootMoves: [other]});
    assert.equal(result.move.to, winner.to); assert.equal(result.solved, true);
    assert.equal(R.applyMove(state, result.move).state.winner, 3); assertLegal(state, result);
  });

  test(subject.name + ': interrupting greedy evaluation leaves no completed iteration and still returns a legal fallback', () => {
    let calls = 0;
    // The sixth clock call is inside the first pushed candidate's transport
    // evaluation; this tests finally-pop rather than a timing-sensitive sleep.
    const engine = withClock(subject.filename, () => ++calls >= 6 ? 20 : 0);
    const state = R.createGame(), snapshot = JSON.stringify(state), events = [];
    const result = engine.search(state, {level: 4, time: 15, depth: 3, onIteration: e => events.push(e)});
    assert.equal(result.expired, true); assert.equal(result.depth, 0); assert.equal(events.length, 0);
    assert.equal(result.candidates.length, 0); assert.ok(Number.isFinite(result.score));
    assertLegal(state, result); assert.equal(JSON.stringify(state), snapshot);
  });

  test(subject.name + ': a partial second iteration never replaces completed scores or emits a callback, and the next search starts cleanly', () => {
    let time = 0, arm = false;
    const engine = withClock(subject.filename, () => time);
    const state = R.createGame(), snapshot = JSON.stringify(state), events = [];
    const result = engine.search(state, {
      level: 4, time: 15, depth: 3, selective: false,
      onIteration(e) { events.push(e); arm = true; },
      onHistoryContext(e) { if (arm && e.remainingDepth >= 1) time = 20; }
    });
    assert.equal(result.expired, true); assert.equal(result.depth, 1);
    assert.deepEqual(events.map(e => e.depth), [1]); assert.equal(result.score, events[0].score);
    assertLegal(state, result); assert.equal(JSON.stringify(state), snapshot);
    time = 0; arm = false;
    const warm = engine.search(state, {level: 4, time: 15, depth: 2, selective: false});
    baseline.clear(); const cold = baseline.search(state, {level: 4, time: 2000, depth: 2, selective: false});
    assert.equal(warm.depth, 2); assert.ok(Math.abs(warm.score - cold.score) < 1e-7);
    assertLegal(state, warm); assert.equal(JSON.stringify(state), snapshot);
  });

  test(subject.name + ': real 15ms search reports only completed iteration callbacks', () => {
    const state = replay.states[65], snapshot = JSON.stringify(state), events = [];
    subject.engine.clear();
    const result = subject.engine.search(state, {level: 4, time: 15, depth: 30, onIteration: e => events.push(e)});
    assert.deepEqual(events.map(e => e.depth), Array.from({length: result.depth}, (_, i) => i + 1));
    if (events.length) assert.equal(events.at(-1).score, result.score);
    assertLegal(state, result); assert.equal(JSON.stringify(state), snapshot);
  });
}
