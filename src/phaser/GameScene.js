import Phaser from 'phaser'
import { W, H, background, button, text, fade, hex } from './common.js'
import { ring, flashAt, popText, grains } from './fx.js'
import { audioState, sfx } from '../sound.js'
import { data, persist } from './save.js'
import {
  freshState, canPour, pour, isSolved, isComplete, lockLeft, legalMoves, solve, cur, alt, isChameleon, starsFor,
  generate, rushSpec, levelPuzzle, TOTAL_LEVELS, WORLDS, LEVELS_PER_WORLD,
} from '../game.js'

const BOARD_TOP = 170
const BOARD_H = 620
const RUSH_TIME = 120
const worldOf = (level) => Math.min(WORLDS.length - 1, Math.floor((level - 1) / LEVELS_PER_WORLD))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const slotsOf = (b) => (b.comps.length > 1 ? 2 : 1)

const INTROS = {
  13: 'New: twin flasks! Each chamber holds 2 grains: tap the left or right half.',
  25: 'New: padlocked tubes open once enough tubes are sealed.',
  37: 'New: ✨ chameleon sand changes colour every time it is poured!',
  49: 'The Grand Gallery: every trick at once.',
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game')
  }

  init(cfg = {}) {
    this.mode = cfg.mode ?? 'puzzle'
    this.level = cfg.level ?? 1
    this.worldIndex = this.mode === 'puzzle' ? worldOf(this.level) : 0
    this.rushSolved = 0
    this.rushSeed = Math.floor(Math.random() * 1e9)
    this.busy = true
    this.phase = 'intro'
    this.boxes = []
    this.panel = null
    this.sel = null
    this.marks = []
    this.hintMarks = []
    this.history = []
  }

  create() {
    const world = WORLDS[this.worldIndex]
    this.world = world
    background(this, world.bg, 0xfde68a)
    this.cameras.main.fadeIn(250, 4, 20, 36)

    // Opaque header keeps pop-ins and pours tidy.
    this.add.rectangle(W / 2, 62, W, 124, 0x1a0e04, 0.94).setDepth(30)
    this.add.rectangle(W / 2, 124, W, 3, world.color, 0.9).setDepth(31)
    this.titleText = text(this, 24, 22, '', 30, '#fff', { fontStyle: 'bold' }).setDepth(32)
    this.subText = text(this, 24, 66, '', 18, '#fcd34d').setDepth(32)
    this.mainText = text(this, W / 2 + 20, 56, '', 54, '#fde68a', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(32)
    this.rightText = text(this, W - 24, 36, '', 20, '#fde68a', { align: 'right' }).setOrigin(1, 0.5).setDepth(32)
    this.rightText2 = text(this, W - 24, 70, '', 20, '#fde68a', { align: 'right' }).setOrigin(1, 0.5).setDepth(32)

    const y = 822
    const opts = { w: 112, h: 46, size: 16 }
    button(this, 68, y, '💡 Hint', () => this.hint(), { ...opts, color: 0xb45309 }).setDepth(32)
    button(this, 192, y, '↶ Undo', () => this.undo(), { ...opts, color: 0x0369a1 }).setDepth(32)
    button(this, 316, y, '↺ Reset', () => this.reset(), { ...opts, color: 0x7c3aed }).setDepth(32)
    this.soundBtn = button(this, 440, y, audioState.muted ? '🔇' : '🔊', () => {
      audioState.muted = !audioState.muted
      data.muted = audioState.muted
      persist()
      this.soundBtn.setLabel(audioState.muted ? '🔇' : '🔊')
    }, { ...opts, color: 0x374151 }).setDepth(32)
    button(this, 564, y, this.mode === 'puzzle' ? 'Levels' : 'Menu', () => this.leave(), { ...opts, color: 0x374151 }).setDepth(32)

    this.toast = text(this, W / 2, 400, '', 32, '#fde68a', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6, align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5).setDepth(50).setAlpha(0)

    if (this.mode === 'rush') {
      this.timeLeft = RUSH_TIME
      this.timer = this.time.addEvent({ delay: 100, loop: true, callback: () => this.tick() })
    }
    this.begin(false)
  }

  // ---------- level lifecycle ----------

  async begin(withWipe) {
    this.busy = true
    this.phase = 'intro'
    if (withWipe) await this.wipe(true)
    this.puzzle = this.mode === 'puzzle' ? levelPuzzle(this.level) : generate(rushSpec(this.rushSolved, this.rushSeed + this.rushSolved * 31))
    this.state = freshState(this.puzzle)
    this.history = []
    this.moves = 0
    this.sel = null
    this.panel?.destroy()
    this.panel = null
    this.clearMarks()
    this.clearHint()
    this.buildBoard()
    this.refreshHud()
    if (withWipe) await this.wipe(false)
    if (this.mode === 'puzzle') await this.intro()
    await this.popIn()
    this.phase = 'play'
    this.busy = false
  }

  // Lays the containers out in rows and builds their glass, sand and padlocks.
  buildBoard() {
    this.boxes.forEach((b) => b.cont.destroy())
    const s = this.state
    const total = s.boxes.reduce((n, b) => n + slotsOf(b), 0)
    const nRows = total <= 7 ? 1 : Math.ceil(total / 7)
    const per = Math.ceil(total / nRows)
    const rows = [[]]
    let used = 0
    s.boxes.forEach((b, bi) => {
      const sl = slotsOf(b)
      if (used + sl > per && rows[rows.length - 1].length) {
        rows.push([])
        used = 0
      }
      rows[rows.length - 1].push(bi)
      used += sl
    })
    const rowH = BOARD_H / rows.length
    const uh = clamp(Math.floor((rowH - 100) / 4), 24, 52)
    const widest = Math.max(...rows.map((r) => r.reduce((n, bi) => n + slotsOf(s.boxes[bi]), 0)))
    const slotW = Math.min(96, Math.floor(600 / widest))
    const tw = Math.min(72, slotW - 16)
    const fullH = 4 * uh + 12
    this.uh = uh
    this.boxes = []

    rows.forEach((row, ri) => {
      const rowSlots = row.reduce((n, bi) => n + slotsOf(s.boxes[bi]), 0)
      let x = (W - rowSlots * slotW) / 2
      const bottom = BOARD_TOP + rowH * (ri + 0.5) + 20 + fullH / 2
      row.forEach((bi) => {
        const b = s.boxes[bi]
        const split = b.comps.length > 1
        const h = split ? 2 * uh + 12 : fullH
        const width = split ? 2 * tw + 24 : tw
        const cx = x + (slotsOf(b) * slotW) / 2
        x += slotsOf(b) * slotW
        const cy = bottom - h / 2
        const comps = b.comps.map((ci, k) => ({
          ci,
          cx: split ? (k ? 1 : -1) * (tw / 2 + 6) : 0,
          cw: tw,
          floorY: h / 2 - 5,
          cap: s.caps[ci],
        }))
        const cont = this.add.container(cx, cy).setDepth(5).setScale(0)
        const back = this.add.graphics()
        const front = this.add.graphics()
        const bx = { bi, cont, x: cx, y: cy, w: width, h, uh, uw: tw - 10, comps, split, units: {}, corks: {}, lockUI: null, back, front }
        if (split) back.lineStyle(4, 0xfbbf24, 0.85).strokeRoundedRect(-width / 2, -h / 2 - 4, width, h + 8, 14)
        comps.forEach((c) => back.fillStyle(0xffffff, 0.07).fillRoundedRect(c.cx - c.cw / 2, -h / 2, c.cw, h, { tl: 6, tr: 6, bl: 16, br: 16 }))
        cont.add([back, front])
        cont.setSize(width, h).setInteractive({ useHandCursor: true })
        cont.on('pointerdown', (pointer) => this.tapBox(bi, split && pointer.worldX >= bx.x ? 1 : 0))
        this.boxes.push(bx)
        this.renderBox(bx)
      })
    })
    this.syncLocks(false)
  }

  compOf(ci) {
    for (const bx of this.boxes) {
      const comp = bx.comps.find((c) => c.ci === ci)
      if (comp) return { bx, comp }
    }
    return null
  }

  makeUnit(bx, comp, k, unit) {
    const y = comp.floorY - k * bx.uh
    const img = this.add.image(comp.cx, y, `sand_${cur(unit)}`).setOrigin(0.5, 1).setDisplaySize(bx.uw, bx.uh)
    const rec = { img, dot: null, fullSY: img.scaleY, col: cur(unit) }
    bx.cont.add(img)
    if (isChameleon(unit)) {
      const dot = this.add.circle(comp.cx, y - bx.uh / 2, Math.max(5, Math.min(bx.uw, bx.uh) * 0.2), hex(alt(unit))).setStrokeStyle(2, 0xffffff, 0.95)
      bx.cont.add(dot)
      this.tweens.add({ targets: dot, scale: 1.25, duration: 700 + k * 90, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      rec.dot = dot
    }
    return rec
  }

  renderBox(bx) {
    const s = this.state
    bx.comps.forEach((comp) => {
      bx.units[comp.ci]?.forEach((r) => {
        if (r.dot) this.tweens.killTweensOf(r.dot)
        r.img.destroy()
        r.dot?.destroy()
      })
      bx.corks[comp.ci]?.destroy()
      bx.corks[comp.ci] = null
      bx.units[comp.ci] = s.comps[comp.ci].map((u, k) => this.makeUnit(bx, comp, k, u))
      if (isComplete(s, comp.ci)) {
        const cork = this.add.image(comp.cx, -bx.h / 2 + 2, 'cork').setDisplaySize(bx.uw + 6, 16)
        bx.cont.add(cork)
        bx.corks[comp.ci] = cork
      }
    })
    bx.front.clear()
    bx.comps.forEach((c) => {
      const sealed = isComplete(s, c.ci)
      bx.front.lineStyle(3, sealed ? 0xfde68a : 0xffffff, sealed ? 0.95 : 0.55)
      bx.front.strokeRoundedRect(c.cx - c.cw / 2, -bx.h / 2, c.cw, bx.h, { tl: 6, tr: 6, bl: 16, br: 16 })
      bx.front.fillStyle(0xffffff, 0.22).fillRoundedRect(c.cx - c.cw / 2 + 6, -bx.h / 2 + 12, 5, bx.h - 34, 3)
    })
    bx.cont.bringToTop(bx.front)
    Object.values(bx.corks).forEach((c) => c && bx.cont.bringToTop(c))
    if (bx.lockUI) bx.cont.bringToTop(bx.lockUI)
  }

  renderAll() {
    this.boxes.forEach((bx) => this.renderBox(bx))
    this.syncLocks(false)
  }

  // Keeps padlock overlays in step with the board. With animate on, a freshly opened lock bursts open.
  syncLocks(animate) {
    this.boxes.forEach((bx) => {
      const left = lockLeft(this.state, bx.bi)
      if (left > 0) {
        if (!bx.lockUI) {
          const ui = this.add.container(0, 0)
          ui.add(this.add.rectangle(0, 0, bx.w, bx.h, 0x000000, 0.55))
          ui.add(this.add.image(0, -6, 'lock').setScale(0.95))
          ui.add(text(this, 0, 6, '', 22, '#451a03', { fontStyle: 'bold' }).setOrigin(0.5))
          bx.cont.add(ui)
          bx.lockUI = ui
        }
        bx.lockUI.list[2].setText(String(left))
      } else if (bx.lockUI) {
        const ui = bx.lockUI
        bx.lockUI = null
        if (animate) {
          sfx.unlock()
          flashAt(this, bx.x, bx.y, 220, 0xfde68a)
          ring(this, bx.x, bx.y, 0xfbbf24, 120, 600, 5)
          grains(this, bx.x, bx.y, 0xfbbf24, 18, 320)
          this.tweens.add({ targets: ui, scale: 1.5, alpha: 0, duration: 380, onComplete: () => ui.destroy() })
          this.say('Unlocked!', '#86efac')
        } else {
          ui.destroy()
        }
      }
    })
  }

  async popIn() {
    const jobs = this.boxes.map((bx, i) => this.tween({ targets: bx.cont, scale: 1, duration: 280, delay: i * 45, ease: 'Back.Out' }))
    sfx.whoosh()
    await Promise.all(jobs)
  }

  async intro() {
    const label = `Level ${this.level}`
    const sub = INTROS[this.level] ?? this.world.blurb
    sfx.whoosh()
    const cy = BOARD_TOP + BOARD_H / 2
    const band = this.add.rectangle(W / 2, cy, W, 190, 0x000000, 0.78).setDepth(40).setScale(1, 0)
    const l1 = this.add.rectangle(W / 2, cy - 95, W, 4, this.world.color).setDepth(41).setScale(0, 1)
    const l2 = this.add.rectangle(W / 2, cy + 95, W, 4, this.world.color).setDepth(41).setScale(0, 1)
    const t1 = text(this, -300, cy - 30, label, 64, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(42)
    const t2 = text(this, W + 400, cy + 40, sub, 21, '#fde68a', { align: 'center', wordWrap: { width: 540 } }).setOrigin(0.5).setDepth(42)
    await Promise.all([
      this.tween({ targets: band, scaleY: 1, duration: 220, ease: 'Back.Out' }),
      this.tween({ targets: [l1, l2], scaleX: 1, duration: 300 }),
      this.tween({ targets: t1, x: W / 2, duration: 420, ease: 'Back.Out' }),
      this.tween({ targets: t2, x: W / 2, duration: 520, ease: 'Cubic.Out' }),
    ])
    await this.delay(INTROS[this.level] ? 1500 : 850)
    await Promise.all([
      this.tween({ targets: t1, x: W + 400, duration: 300, ease: 'Cubic.In' }),
      this.tween({ targets: t2, x: -400, duration: 300, ease: 'Cubic.In' }),
      this.tween({ targets: band, scaleY: 0, duration: 260, delay: 120 }),
      this.tween({ targets: [l1, l2], scaleX: 0, duration: 260, delay: 120 }),
    ])
    ;[band, l1, l2, t1, t2].forEach((o) => o.destroy())
  }

  // A wave of golden sand sweeps over the screen between levels.
  async wipe(closing) {
    sfx.whoosh()
    if (closing) {
      const wave = this.add.container(0, H + 60).setDepth(60)
      wave.add(this.add.rectangle(0, 0, W, H + 200, 0xd97706).setOrigin(0, 0))
      for (let i = 0; i < 14; i++) {
        wave.add(this.add.circle(i * (W / 13), Phaser.Math.Between(-4, 6), Phaser.Math.Between(22, 36), 0xd97706))
        wave.add(this.add.circle(i * (W / 13) + 20, Phaser.Math.Between(-16, -4), Phaser.Math.Between(8, 16), 0xfde68a, 0.9))
      }
      wave.add(this.add.rectangle(0, 120, W, 40, 0x92400e, 0.6).setOrigin(0, 0))
      this.wave = wave
      await this.tween({ targets: wave, y: -40, duration: 520, ease: 'Cubic.InOut' })
    } else {
      await this.tween({ targets: this.wave, y: -H - 260, duration: 560, ease: 'Cubic.InOut' })
      this.wave.destroy()
      this.wave = null
    }
  }

  // ---------- helpers ----------

  tween(config) {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: resolve }))
  }

  delay(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve))
  }

  say(msg, color = '#fde68a') {
    this.tweens.killTweensOf(this.toast)
    this.toast.setText(msg).setColor(color).setAlpha(1).setScale(0.6).setY(BOARD_TOP + 330)
    this.tweens.add({ targets: this.toast, scale: 1, duration: 150 })
    this.tweens.add({ targets: this.toast, y: BOARD_TOP + 280, alpha: 0, delay: 1100, duration: 600 })
  }

  refreshHud() {
    if (this.mode === 'puzzle') {
      this.titleText.setText(`Level ${this.level}`)
      this.subText.setText(this.world.name)
      this.mainText.setText(`${this.moves}`)
      this.rightText.setText(`Par ${this.puzzle?.par ?? 0}`).setY(52)
      this.rightText2.setText('')
    } else {
      this.titleText.setText('Rush')
      this.subText.setText(`Best ${data.bestRush}`)
      this.mainText.setText(`${Math.ceil(this.timeLeft)}s`)
      this.rightText.setText(`Solved ${this.rushSolved}`).setY(36)
      this.rightText2.setText(`${this.moves} moves`)
    }
  }

  markComp(ci, color, pulse = true) {
    const found = this.compOf(ci)
    if (!found) return null
    const { bx, comp } = found
    const g = this.add.graphics()
    g.lineStyle(4, color, 1).strokeRoundedRect(comp.cx - comp.cw / 2 - 3, -bx.h / 2 - 3, comp.cw + 6, bx.h + 6, 12)
    bx.cont.add(g)
    if (pulse) this.tweens.add({ targets: g, alpha: 0.3, duration: 420, yoyo: true, repeat: -1 })
    return g
  }

  clearMarks() {
    this.marks.forEach((g) => {
      this.tweens.killTweensOf(g)
      g.destroy()
    })
    this.marks = []
  }

  // ---------- play ----------

  tapBox(bi, half) {
    if (this.busy || this.phase !== 'play') return
    this.clearHint()
    const s = this.state
    const bx = this.boxes[bi]
    const ci = s.boxes[bi].comps[half]
    const left = lockLeft(s, bi)
    const shake = () => this.tweens.add({ targets: bx.cont, x: bx.x + 5, duration: 45, yoyo: true, repeat: 2, onComplete: () => (bx.cont.x = bx.x) })

    if (this.sel === null) {
      if (left > 0) {
        sfx.locked()
        shake()
        this.say(`Seal ${left} more tube${left > 1 ? 's' : ''} to open`, '#fca5a5')
      } else if (isComplete(s, ci)) {
        sfx.locked()
        shake()
      } else if (s.comps[ci].length) {
        this.select(ci)
      }
      return
    }

    if (ci === this.sel) {
      this.deselect()
      return
    }
    if (canPour(s, this.sel, ci)) {
      this.doPour(this.sel, ci)
      return
    }
    // Not a legal target: swap selection if this is a pourable source, otherwise just cancel.
    this.deselect()
    if (left > 0) {
      sfx.locked()
      shake()
      this.say(`Seal ${left} more tube${left > 1 ? 's' : ''} to open`, '#fca5a5')
    } else if (s.comps[ci].length && !isComplete(s, ci)) {
      this.select(ci)
    } else {
      sfx.locked()
    }
  }

  select(ci) {
    this.sel = ci
    sfx.pick()
    const { bx } = this.compOf(ci)
    this.tweens.killTweensOf(bx.cont)
    this.tweens.add({ targets: bx.cont, y: bx.y - 22, duration: 140, ease: 'Back.Out' })
    this.marks.push(this.markComp(ci, 0xfde047, false))
    this.state.comps.forEach((_, other) => {
      if (canPour(this.state, ci, other)) this.marks.push(this.markComp(other, 0x86efac))
    })
  }

  deselect() {
    if (this.sel === null) return
    const { bx } = this.compOf(this.sel)
    this.tweens.killTweensOf(bx.cont)
    this.tweens.add({ targets: bx.cont, y: bx.y, duration: 140 })
    this.sel = null
    this.clearMarks()
  }

  async doPour(from, to) {
    const s = this.state
    this.history.push(s.comps.map((c) => c.slice()))
    const sealedBefore = new Set(s.comps.map((_, i) => i).filter((i) => isComplete(s, i)))
    const toLen = s.comps[to].length
    const { n, moved } = pour(s, from, to)
    this.moves++
    this.busy = true
    this.sel = null
    this.clearMarks()
    this.refreshHud()
    await this.pourAnim(from, to, n, moved, toLen)

    this.renderAll()
    s.comps.forEach((_, ci) => {
      if (isComplete(s, ci) && !sealedBefore.has(ci)) this.sealFx(ci)
    })
    this.syncLocks(true)
    if (isSolved(s)) {
      this.win()
      return
    }
    if (!legalMoves(s).length) this.say('No moves left: try Undo', '#fca5a5')
    this.busy = false
  }

  // The source tube tips over the target and the sand streams across, layer by layer.
  async pourAnim(from, to, n, moved, toLen) {
    const src = this.compOf(from)
    const dst = this.compOf(to)
    const bxF = src.bx
    const bxT = dst.bx
    const unitsF = bxF.units[from]
    const srcUnits = Array.from({ length: n }, (_, i) => unitsF[unitsF.length - 1 - i])
    const newUnits = moved.map((u, i) => {
      const rec = this.makeUnit(bxT, dst.comp, toLen + i, u)
      rec.img.setScale(rec.img.scaleX, 0)
      rec.dot?.setVisible(false)
      return rec
    })
    const color = hex(srcUnits[0].col)

    // Which way to tip: toward the target, unless the tube would swing off screen.
    const reach = bxF.h * 0.93
    const lipX = (side) => bxT.x + dst.comp.cx - side * dst.comp.cw * 0.18
    let side = bxT.x > bxF.x ? 1 : bxT.x < bxF.x ? -1 : bxT.x < W / 2 ? -1 : 1
    if (lipX(side) - side * reach < 4 || lipX(side) - side * reach > W - 4) side = -side
    const th = side * 68
    const rad = (th * Math.PI) / 180
    const lip = { x: src.comp.cx + side * src.comp.cw / 2, y: -bxF.h / 2 }
    const lipWorld = { x: lipX(side), y: Math.max(150, bxT.y - bxT.h / 2 - 16) }
    const centre = {
      x: lipWorld.x - (lip.x * Math.cos(rad) - lip.y * Math.sin(rad)),
      y: lipWorld.y - (lip.x * Math.sin(rad) + lip.y * Math.cos(rad)),
    }

    bxF.cont.setDepth(20)
    this.tweens.killTweensOf(bxF.cont)
    await this.tween({ targets: bxF.cont, x: centre.x, y: centre.y, angle: th, duration: 300, ease: 'Cubic.InOut' })

    const landing = (v) => bxT.y + bxT.h / 2 - 5 - (toLen + v) * bxT.uh
    const stream = this.add.rectangle(lipWorld.x, lipWorld.y, 7, 2, color).setOrigin(0.5, 0).setDepth(19)
    const prog = { v: 0 }
    const ticker = this.time.addEvent({ delay: 55, loop: true, callback: () => grains(this, lipWorld.x, landing(prog.v), color, 2, 110, true) })
    sfx.pour(n)
    await this.tween({
      targets: prog,
      v: n,
      duration: 340 * n + 120,
      ease: 'Sine.InOut',
      onUpdate: () => {
        srcUnits.forEach((r, i) => {
          r.img.scaleY = r.fullSY * (1 - clamp(prog.v - i, 0, 1))
          if (r.dot) r.dot.setVisible(prog.v - i <= 0)
        })
        newUnits.forEach((r, i) => (r.img.scaleY = r.fullSY * clamp(prog.v - i, 0, 1)))
        stream.height = Math.max(2, landing(prog.v) - lipWorld.y)
      },
    })
    ticker.remove()
    stream.destroy()
    grains(this, lipWorld.x, landing(n), color, 8, 180, true)
    if (moved.some((u) => isChameleon(u))) {
      sfx.shimmer()
      flashAt(this, bxT.x + dst.comp.cx, landing(n), 120, 0xffffff)
    }
    await this.tween({ targets: bxF.cont, x: bxF.x, y: bxF.y, angle: 0, duration: 240, ease: 'Cubic.InOut' })
    bxF.cont.setDepth(5)
    newUnits.forEach((r) => {
      if (r.dot) this.tweens.killTweensOf(r.dot)
      r.img.destroy()
      r.dot?.destroy()
    })
  }

  sealFx(ci) {
    const { bx, comp } = this.compOf(ci)
    const x = bx.x + comp.cx
    const y = bx.y
    const cork = bx.corks[ci]
    if (cork) {
      cork.setY(-bx.h / 2 - 40).setAlpha(0)
      this.tweens.add({ targets: cork, y: -bx.h / 2 + 2, alpha: 1, duration: 260, ease: 'Bounce.Out' })
    }
    sfx.seal()
    const col = hex(cur(this.state.comps[ci][0]))
    ring(this, x, y, 0xfde68a, bx.h * 0.6, 520, 5)
    flashAt(this, x, y, bx.h * 1.1, col)
    grains(this, x, y - bx.h / 2, col, 16, 300, true)
    popText(this, x, y - bx.h / 2 - 24, 'Sealed!', '#fde68a', 22)
  }

  undo() {
    if (this.busy || this.phase !== 'play' || !this.history.length) return
    this.deselect()
    this.clearHint()
    this.state.comps = this.history.pop()
    this.moves = Math.max(0, this.moves - 1)
    sfx.drop()
    this.renderAll()
    this.refreshHud()
  }

  reset() {
    if (this.busy || this.phase !== 'play') return
    this.deselect()
    this.clearHint()
    this.state = freshState(this.puzzle)
    this.history = []
    this.moves = 0
    sfx.whoosh()
    this.renderAll()
    this.refreshHud()
  }

  hint() {
    if (this.busy || this.phase !== 'play') return
    this.deselect()
    this.clearHint()
    const path = solve(this.state, { nodes: 30000, maxDepth: 80 })
    if (!path || !path.length) {
      this.say('No way out from here: try Undo', '#fca5a5')
      return
    }
    sfx.hint()
    const [a, b] = path[0]
    this.hintMarks = [this.markComp(a, 0xfde047), this.markComp(b, 0x86efac)].filter(Boolean)
    this.hintTimer = this.time.delayedCall(3500, () => this.clearHint())
  }

  clearHint() {
    this.hintTimer?.remove()
    this.hintTimer = null
    this.hintMarks.forEach((g) => {
      this.tweens.killTweensOf(g)
      g.destroy()
    })
    this.hintMarks = []
  }

  tick() {
    if (this.phase !== 'play' && this.phase !== 'intro') return
    if (this.phase === 'intro') return
    this.timeLeft = Math.max(0, this.timeLeft - 0.1)
    this.refreshHud()
    if (this.timeLeft <= 0) this.finishRush()
  }

  // ---------- endings ----------

  async win() {
    this.busy = true
    this.phase = 'won'
    this.clearHint()
    await this.delay(200)
    this.boxes.forEach((bx, i) => {
      this.time.delayedCall(i * 80, () => {
        if (!bx.cont.active) return
        bx.comps.forEach((comp) => {
          const ci = comp.ci
          if (!this.state.comps[ci].length) return
          const col = hex(cur(this.state.comps[ci][0]))
          flashAt(this, bx.x + comp.cx, bx.y, bx.h * 1.2, col)
          grains(this, bx.x + comp.cx, bx.y - bx.h / 2, col, 14, 360, true)
        })
        ring(this, bx.x, bx.y, 0xfde68a, bx.h * 0.7, 600, 4)
        this.tweens.add({ targets: bx.cont, scale: 1.1, duration: 140, yoyo: true })
      })
    })
    sfx.win()
    await this.delay(this.boxes.length * 80 + 600)

    if (this.mode === 'rush') {
      this.rushSolved++
      const bonus = 10 + Math.min(6, this.puzzle.spec.colors - 3)
      this.timeLeft = Math.min(RUSH_TIME + 30, this.timeLeft + bonus)
      popText(this, W / 2, 400, `+${bonus}s`, '#86efac', 46)
      sfx.coin()
      await this.delay(500)
      if (this.phase !== 'won') return
      this.begin(false)
      return
    }

    this.say('SORTED!', '#fde68a')
    await this.delay(700)
    const stars = starsFor(this.moves, this.puzzle.par)
    const prev = data.stars[this.level] || 0
    data.stars[this.level] = Math.max(prev, stars)
    data.unlocked = Math.min(TOTAL_LEVELS, Math.max(data.unlocked, this.level + 1))
    persist()
    this.showPanel({ won: true, title: `Level ${this.level} Complete!`, stars, lines: [`${this.moves} moves · par ${this.puzzle.par}`] })
  }

  finishRush() {
    if (this.phase === 'over') return
    this.phase = 'over'
    this.busy = true
    this.clearHint()
    this.deselect()
    sfx.lose()
    const record = this.rushSolved > data.bestRush
    if (record) {
      data.bestRush = this.rushSolved
      persist()
    }
    this.showPanel({
      won: false,
      title: "Time's up!",
      lines: [`Puzzles sorted: ${this.rushSolved}`, record ? '🏆 New best!' : `Best ${data.bestRush}`],
    })
  }

  leave() {
    fade(this, this.mode === 'puzzle' ? 'levels' : 'menu', { world: this.worldIndex })
  }

  showPanel({ won, title, stars, lines = [] }) {
    const p = this.add.container(0, 0).setDepth(70)
    this.panel = p
    p.add(this.add.rectangle(W / 2, H / 2, W, H, 0x120904, 0.82).setInteractive())
    const card = this.add.graphics()
    card.fillStyle(0x2a1606, 1).fillRoundedRect(60, 170, W - 120, 500, 24)
    card.lineStyle(3, won ? 0xfbbf24 : 0xfb7185, 0.9).strokeRoundedRect(60, 170, W - 120, 500, 24)
    p.add(card)
    p.add(text(this, W / 2, 225, title, 36, won ? '#fde68a' : '#fda4af', { fontStyle: 'bold' }).setOrigin(0.5))
    if (stars) {
      for (let i = 0; i < 3; i++) {
        const s = text(this, W / 2 + (i - 1) * 90, 330, '★', 84, i < stars ? '#fde047' : '#4a2c0e').setOrigin(0.5).setScale(0)
        p.add(s)
        this.tweens.add({ targets: s, scale: 1, duration: 400, delay: 300 + i * 260, ease: 'Back.Out', onStart: () => i < stars && sfx.coin() })
      }
    }
    p.add(text(this, W / 2, stars ? 405 : 320, lines.join('\n'), 26, '#fcd34d', { align: 'center', lineSpacing: 10 }).setOrigin(0.5, 0))

    const add = (label, y, fn, color) => p.add(button(this, W / 2, y, label, fn, { w: 280, h: 52, color }))
    if (this.mode === 'puzzle') {
      const more = won && this.level < TOTAL_LEVELS
      if (more) add('Next level ▶', 500, () => this.next(), 0xb45309)
      add('Replay', more ? 560 : 500, () => this.begin(true), 0x92400e)
      add('Levels', more ? 620 : 560, () => this.leave(), 0x374151)
    } else {
      add('Play again', 500, () => fade(this, 'game', { mode: 'rush' }), 0xb45309)
      add('Menu', 560, () => this.leave(), 0x374151)
    }
    p.setAlpha(0)
    this.tweens.add({ targets: p, alpha: 1, duration: 300 })
  }

  next() {
    const level = this.level + 1
    if (worldOf(level) !== this.worldIndex) {
      fade(this, 'game', { mode: 'puzzle', level })
    } else {
      this.level = level
      this.begin(true)
    }
  }
}
