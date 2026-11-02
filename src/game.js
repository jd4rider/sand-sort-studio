// Pure Sand Sort Studio rules: no Phaser here so everything can be unit tested.
//
// A level is a list of containers. A normal container has one compartment of capacity 4;
// a split container has two small compartments (capacity 2 each). Compartments are arrays of
// units, bottom to top. A unit is a number: 0-15 is plain sand of that colour, 16+ is
// colour-changing sand encoded as 16 + current * 16 + next (it flips every time it is poured).
export const CAP = 4
export const SPLIT_CAP = 2
export const PALETTE = [
  '#ef4444', '#f97316', '#facc15', '#84cc16', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#a855f7', '#ec4899', '#f5f5f4', '#92400e', '#0f766e', '#fb7185',
]

export const cur = (u) => (u < 16 ? u : (u - 16) >> 4)
export const alt = (u) => (u < 16 ? -1 : (u - 16) & 15)
export const isChameleon = (u) => u >= 16
export const flip = (u) => (u < 16 ? u : 16 + alt(u) * 16 + cur(u))
export const chameleon = (now, next) => 16 + now * 16 + next

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffle = (arr, rnd) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------- state helpers ----------
// state: { comps: unit[][], caps: number[], boxes: [{ comps: number[], lock: number }] }
// boxes[i].comps lists compartment indices (left to right); lock = completed compartments needed to open.

export const isComplete = (s, ci) => {
  const c = s.comps[ci]
  if (c.length !== s.caps[ci]) return false
  const k = cur(c[0])
  return c.every((u) => cur(u) === k)
}

export const completeCount = (s) => s.comps.reduce((n, _, i) => n + (isComplete(s, i) ? 1 : 0), 0)

export const lockLeft = (s, bi) => Math.max(0, s.boxes[bi].lock - completeCount(s))
export const boxOf = (s, ci) => s.boxes.findIndex((b) => b.comps.includes(ci))

export const topRun = (c) => {
  if (!c.length) return 0
  const k = cur(c[c.length - 1])
  let n = 0
  for (let i = c.length - 1; i >= 0 && cur(c[i]) === k; i--) n++
  return n
}

const isUniform = (c) => c.length > 0 && c.every((u) => cur(u) === cur(c[0]))

export function canPour(s, from, to) {
  if (from === to) return false
  const a = s.comps[from]
  const b = s.comps[to]
  if (!a.length || b.length >= s.caps[to] || isComplete(s, from)) return false
  const bf = boxOf(s, from)
  const bt = boxOf(s, to)
  if (bf === bt || lockLeft(s, bf) > 0 || lockLeft(s, bt) > 0) return false
  return !b.length || cur(b[b.length - 1]) === cur(a[a.length - 1])
}

export const pourAmount = (s, from, to) => Math.min(topRun(s.comps[from]), s.caps[to] - s.comps[to].length)

// Moves the top run (as much as fits). Each moved unit flips if it is colour-changing sand.
export function pour(s, from, to) {
  const n = pourAmount(s, from, to)
  const moved = []
  for (let i = 0; i < n; i++) {
    const u = flip(s.comps[from].pop())
    s.comps[to].push(u)
    moved.push(u)
  }
  return { n, moved }
}

export const isSolved = (s) => s.comps.every((c, i) => !c.length || isComplete(s, i))

export function legalMoves(s) {
  const out = []
  for (let a = 0; a < s.comps.length; a++) {
    if (!s.comps[a].length || isComplete(s, a)) continue
    for (let b = 0; b < s.comps.length; b++) {
      if (!canPour(s, a, b)) continue
      out.push([a, b])
    }
  }
  return out
}

export const cloneState = (s) => ({ comps: s.comps.map((c) => c.slice()), caps: s.caps, boxes: s.boxes })

const keyOf = (s) => s.comps.map((c) => c.join(',')).join('|')

// ---------- solver ----------

// Depth-first search with a visited set. Returns [[from, to], ...] or null.
export function solve(start, { nodes = 60000, rnd = null, maxDepth = 120 } = {}) {
  const seen = new Set()
  let budget = nodes
  let best = null
  const s = cloneState(start)
  const path = []
  const dfs = () => {
    if (isSolved(s)) {
      best = path.slice()
      return true
    }
    if (budget-- <= 0 || path.length >= maxDepth) return false
    const k = keyOf(s)
    if (seen.has(k)) return false
    seen.add(k)
    let moves = legalMoves(s).filter(([a, b]) => {
      // Moving a pure tube into an empty one is pointless.
      if (!s.comps[b].length && isUniform(s.comps[a]) && topRun(s.comps[a]) === s.comps[a].length) return false
      return true
    })
    const score = ([a, b]) => {
      const ca = s.comps[a]
      const cb = s.comps[b]
      let v = 0
      if (cb.length) v += 4
      if (cb.length + pourAmount(s, a, b) === s.caps[b]) v += 6
      if (topRun(ca) === ca.length) v += 3
      if (rnd) v += rnd() * 5
      return -v
    }
    moves = moves.map((m) => [m, score(m)]).sort((x, y) => x[1] - y[1]).map((x) => x[0])
    for (const [a, b] of moves) {
      const fromBefore = s.comps[a].slice()
      const toBefore = s.comps[b].slice()
      pour(s, a, b)
      path.push([a, b])
      if (dfs()) return true
      path.pop()
      s.comps[a] = fromBefore
      s.comps[b] = toBefore
    }
    return false
  }
  return dfs() ? best : null
}

// ---------- generator ----------

// One reverse move: un-pour k units from compartment b back onto compartment a, chosen so that the
// forward move a -> b would move exactly those k units. Returns the forward move or null.
function reverseStep(s, rnd, last) {
  const n = s.comps.length
  const options = []
  for (let b = 0; b < n; b++) {
    const B = s.comps[b]
    for (let k = 1; k <= Math.min(B.length, 4); k++) {
      const pre = []
      for (let i = 0; i < k; i++) pre.push(flip(B[B.length - 1 - i]))
      const x = cur(pre[0])
      if (!pre.every((u) => cur(u) === x)) break
      const rest = B.slice(0, B.length - k)
      if (rest.length && cur(rest[rest.length - 1]) !== x) continue
      for (let a = 0; a < n; a++) {
        if (a === b || boxOf(s, a) === boxOf(s, b)) continue
        if (last && last[0] === b && last[1] === a) continue
        const A = s.comps[a]
        if (A.length + k > s.caps[a]) continue
        const placed = A.concat(pre)
        if (Math.min(topRun(placed), s.caps[b] - rest.length) !== k) continue
        if (placed.length === s.caps[a] && placed.every((u) => cur(u) === cur(placed[0]))) continue
        const before = cloneState(s)
        before.comps[a] = placed
        before.comps[b] = rest
        if (lockLeft(before, boxOf(s, a)) > 0 || lockLeft(before, boxOf(s, b)) > 0) continue
        // Favour moves that bury a different colour: that is what mixes the board.
        const mixes = A.length && cur(A[A.length - 1]) !== x
        // Padlocked tubes must be scrambled while enough other tubes are still complete.
        const lockedHit = [a, b].some((ci) => s.boxes[boxOf(s, ci)].lock && isComplete(s, ci))
        options.push({ a, b, placed, rest, w: (mixes ? 5 : 1) * (rest.length ? 1 : 0.5) * (lockedHit ? 12 : 1) })
      }
    }
  }
  if (!options.length) return null
  let r = rnd() * options.reduce((t, o) => t + o.w, 0)
  let pick = options[options.length - 1]
  for (const o of options) {
    r -= o.w
    if (r <= 0) {
      pick = o
      break
    }
  }
  s.comps[pick.a] = pick.placed
  s.comps[pick.b] = pick.rest
  return [pick.a, pick.b]
}

// Replays the recorded reverse moves forwards to prove the puzzle is solvable.
function finish(cand, seed, spec) {
  const { caps, boxes } = cand
  const check = { comps: cand.comps.map((c) => c.slice()), caps, boxes }
  const path = cand.moves.slice().reverse()
  for (const [a, b] of path) {
    if (!canPour(check, a, b)) return null
    pour(check, a, b)
  }
  if (!isSolved(check)) return null
  return { comps: cand.comps, caps, boxes, par: path.length, solution: path, seed, spec }
}

/**
 * spec: { colors, splits, empties, locks: number[], chameleons, seed }
 *  colors: full colours (4 units each); splits: twin-chamber flasks (each adds 2 small colours of 2 units)
 *  locks: for each entry, one tube starts locked until that many compartments are complete
 * The puzzle is built by scrambling a solved board with reverse pours, so it is always solvable.
 */
export function generate(spec) {
  const { colors, splits = 0, empties = 2, locks = [], chameleons = 0, mix = 2, seed } = spec
  let bestCand = null
  for (let attempt = 0; attempt < 120; attempt++) {
    const rnd = mulberry32(seed * 131 + attempt * 7919)
    const palette = shuffle([...PALETTE.keys()], rnd)
    const big = palette.slice(0, colors)
    const small = palette.slice(colors, colors + splits * 2)
    const used = [...big, ...small]

    const caps = [...Array(colors).fill(CAP), ...Array(splits * 2).fill(SPLIT_CAP), ...Array(empties).fill(CAP)]
    const comps = [...big.map((c) => [c, c, c, c]), ...small.map((c) => [c, c]), ...Array.from({ length: empties }, () => [])]
    const slots = []
    comps.forEach((c, ci) => c.forEach((_, ui) => slots.push([ci, ui])))
    shuffle(slots, rnd)
      .slice(0, chameleons)
      .forEach(([ci, ui]) => {
        const own = comps[ci][ui]
        const other = used.filter((c) => c !== own)[Math.floor(rnd() * (used.length - 1))]
        comps[ci][ui] = chameleon(own, other)
      })

    const boxes = []
    for (let i = 0; i < colors; i++) boxes.push({ comps: [i], lock: 0 })
    for (let i = 0; i < splits; i++) boxes.push({ comps: [colors + i * 2, colors + i * 2 + 1], lock: 0 })
    for (let i = 0; i < empties; i++) boxes.push({ comps: [colors + splits * 2 + i], lock: 0 })
    shuffle(boxes, rnd)
    const plain = shuffle(boxes.filter((b) => b.comps[0] < colors && b.comps.length === 1), rnd)
    locks.forEach((need, i) => {
      if (plain[i]) plain[i].lock = need
    })

    const s = { comps, caps, boxes }
    const moves = []
    const minSteps = Math.round(mix * (colors + splits)) + 4
    // Walk until the board is scrambled enough; a dead end is fine, so remember the last good board.
    let cand = null
    for (let step = 0; step < 500; step++) {
      const m = reverseStep(s, rnd, moves[moves.length - 1])
      if (!m) break
      moves.push(m)
      const lockedOk = boxes.every((b) => !b.lock || s.comps[b.comps[0]].length > 0)
      const spare = boxes.some((b) => b.comps.length === 1 && !s.comps[b.comps[0]].length)
      if (completeCount(s) === 0 && lockedOk && spare) cand = { comps: s.comps.map((c) => c.slice()), moves: moves.slice(), caps, boxes }
      if (cand && moves.length >= minSteps) break
    }
    if (!cand) continue
    if (cand.moves.length < minSteps && attempt < 30 && (!bestCand || cand.moves.length > bestCand.moves.length)) bestCand = cand
    if (cand.moves.length < minSteps && attempt < 30) continue
    const pick = cand.moves.length >= minSteps ? cand : bestCand
    const result = finish(pick, seed, spec)
    if (result) return result
  }
  if (bestCand) {
    const result = finish(bestCand, seed, spec)
    if (result) return result
  }
  throw new Error(`could not generate a level for seed ${seed}`)
}

export const freshState = (level) => ({ comps: level.comps.map((c) => c.slice()), caps: level.caps, boxes: level.boxes })

export function starsFor(moves, par) {
  if (moves <= Math.ceil(par * 1.15) + 1) return 3
  if (moves <= Math.ceil(par * 1.7) + 4) return 2
  return 1
}

// ---------- levels ----------

export const TOTAL_LEVELS = 60
export const LEVELS_PER_WORLD = 12
export const WORLDS = [
  { name: 'Beach Studio', color: 0xf59e0b, bg: ['#7c4a12', '#2a1606'], blurb: 'Pour sand until every tube holds one colour.' },
  { name: 'Twin Flasks', color: 0x38bdf8, bg: ['#0c3a5c', '#04121f'], blurb: 'Split flasks hold two small chambers.' },
  { name: 'Locksmith', color: 0x34d399, bg: ['#0f4a3a', '#04180f'], blurb: 'Padlocked tubes open as others are filled.' },
  { name: 'Chameleon Row', color: 0xf472b6, bg: ['#58123b', '#1f0615'], blurb: 'Colour-changing sand flips every time it is poured.' },
  { name: 'Grand Gallery', color: 0xa78bfa, bg: ['#2e1b5c', '#10082a'], blurb: 'Everything at once. Good luck!' },
]

// Which obstacles appear in level n and how many colours it has.
export function levelSpec(n) {
  const i = n - 1
  const w = Math.floor(i / LEVELS_PER_WORLD)
  const k = i % LEVELS_PER_WORLD
  const seed = n * 6151 + 29
  const mix = 2 + w * 0.7 + k * 0.08
  const colors = (base, span) => base + Math.floor((k * span) / (LEVELS_PER_WORLD - 1))
  if (w === 0) return { colors: colors(3, 4), splits: 0, empties: 2, locks: [], chameleons: 0, seed, mix }
  if (w === 1) return { colors: colors(3, 4), splits: 1 + (k >= 6 ? 1 : 0), empties: 2, locks: [], chameleons: 0, seed, mix }
  if (w === 2) return { colors: colors(4, 4), splits: k >= 8 ? 1 : 0, empties: 2, locks: k >= 5 ? [1, 2] : [1 + (k >= 2 ? 1 : 0)], chameleons: 0, seed, mix }
  if (w === 3) return { colors: colors(4, 3), splits: k >= 7 ? 1 : 0, empties: 2, locks: k >= 8 ? [1] : [], chameleons: 1 + Math.floor(k / 3), seed, mix }
  return { colors: colors(5, 3), splits: 1 + (k >= 6 ? 1 : 0), empties: 2, locks: k >= 3 ? [1, 2] : [1], chameleons: 2 + Math.floor(k / 3), seed, mix }
}

export const levelPuzzle = (n) => generate(levelSpec(n))

// Short obstacle summary for level buttons.
export function tagsOf(spec) {
  return [spec.splits ? '🧪' : '', spec.locks.length ? '🔒' : '', spec.chameleons ? '✨' : ''].filter(Boolean).join(' ')
}

// Rush mode grows a little with every solve.
export function rushSpec(solved, seed) {
  return {
    colors: Math.min(7, 3 + Math.floor(solved / 2)),
    splits: solved >= 3 ? 1 : 0,
    empties: 2,
    locks: solved >= 6 ? [1] : [],
    chameleons: solved >= 9 ? 2 : 0,
    seed,
  }
}
