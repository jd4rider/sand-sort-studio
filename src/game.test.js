import test from 'node:test'
import assert from 'node:assert/strict'
import {
  levelPuzzle, generate, rushSpec, freshState, canPour, pour, isSolved, isComplete, completeCount, lockLeft, solve,
  chameleon, flip, cur, legalMoves, starsFor, TOTAL_LEVELS, levelSpec,
} from './game.js'

const mk = (comps, caps, boxes) => ({ comps, caps, boxes: boxes ?? comps.map((_, i) => ({ comps: [i], lock: 0 })) })

test('pour moves the top run onto a matching colour or an empty tube', () => {
  const s = mk([[1, 2, 2], [3, 2], [], [4]], [4, 4, 4, 4])
  assert.ok(canPour(s, 0, 1))
  assert.ok(canPour(s, 0, 2))
  assert.ok(!canPour(s, 0, 3))
  const { n } = pour(s, 0, 1)
  assert.equal(n, 2)
  assert.deepEqual(s.comps[0], [1])
  assert.deepEqual(s.comps[1], [3, 2, 2, 2])
})

test('pours stop when the target is full and complete tubes are sealed', () => {
  const s = mk([[1, 2, 2, 2], [2, 2, 2], [5, 5, 5, 5]], [4, 4, 4])
  assert.equal(pour(s, 0, 1).n, 1)
  assert.ok(isComplete(s, 1))
  assert.ok(!canPour(s, 1, 0))
  assert.ok(!canPour(s, 2, 0))
})

test('colour-changing sand flips every time it is poured', () => {
  const c = chameleon(3, 7)
  assert.equal(cur(c), 3)
  assert.equal(cur(flip(c)), 7)
  const s = mk([[c], []], [4, 4])
  pour(s, 0, 1)
  assert.equal(cur(s.comps[1][0]), 7)
  pour(s, 1, 0)
  assert.equal(cur(s.comps[0][0]), 3)
})

test('split flasks pour out of one chamber only and never into their twin', () => {
  const s = mk([[1, 2], [2], []], [2, 2, 4], [{ comps: [0, 1], lock: 0 }, { comps: [2], lock: 0 }])
  assert.ok(!canPour(s, 0, 1))
  assert.ok(canPour(s, 0, 2))
})

test('locked tubes open once enough compartments are complete', () => {
  const s = mk([[1, 1, 1, 1], [2, 3], [3, 2], []], [4, 4, 4, 4], [
    { comps: [0], lock: 0 }, { comps: [1], lock: 1 }, { comps: [2], lock: 2 }, { comps: [3], lock: 0 },
  ])
  assert.equal(completeCount(s), 1)
  assert.equal(lockLeft(s, 1), 0)
  assert.equal(lockLeft(s, 2), 1)
  assert.ok(canPour(s, 1, 3))
  assert.ok(!canPour(s, 2, 3))
  assert.ok(!canPour(s, 3, 2))
})

test('every journey level starts unsolved and its stored solution solves it', () => {
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const p = levelPuzzle(n)
    const s = freshState(p)
    assert.ok(!isSolved(s), `level ${n} starts solved`)
    assert.equal(completeCount(s), 0, `level ${n} starts with a sealed tube`)
    for (const b of p.boxes) if (b.lock) assert.ok(lockLeft(s, p.boxes.indexOf(b)) > 0, `level ${n} lock not closed`)
    for (const [a, b] of p.solution) {
      assert.ok(canPour(s, a, b), `level ${n} illegal solution move`)
      pour(s, a, b)
    }
    assert.ok(isSolved(s), `level ${n} unsolved after solution`)
  }
})

test('levels introduce the obstacles world by world', () => {
  assert.equal(levelSpec(1).splits + levelSpec(1).locks.length + levelSpec(1).chameleons, 0)
  assert.ok(levelSpec(14).splits > 0)
  assert.ok(levelSpec(30).locks.length > 0)
  assert.ok(levelSpec(40).chameleons > 0)
})

test('the solver finds a solution and rush puzzles generate quickly', () => {
  const p = levelPuzzle(5)
  const path = solve(freshState(p))
  assert.ok(path && path.length > 0)
  const s = freshState(p)
  path.forEach(([a, b]) => pour(s, a, b))
  assert.ok(isSolved(s))
  for (let solved = 0; solved < 14; solved++) {
    const lvl = generate(rushSpec(solved, solved * 77 + 3))
    assert.ok(legalMoves(freshState(lvl)).length > 0)
  }
})

test('stars reward staying near par', () => {
  assert.equal(starsFor(10, 10), 3)
  assert.equal(starsFor(20, 10), 2)
  assert.equal(starsFor(60, 10), 1)
})
