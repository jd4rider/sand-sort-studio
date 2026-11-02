import Phaser from 'phaser'
import { W, H, background, button, text, fade, hex } from './common.js'
import { data } from './save.js'
import { TOTAL_LEVELS, WORLDS } from '../game.js'

// A little decorative flask with layered sand.
function miniFlask(scene, x, y, layers) {
  const w = 54
  const u = 30
  const h = u * 4 + 8
  const box = scene.add.container(x, y)
  layers.forEach((c, i) => box.add(scene.add.image(0, h / 2 - 4 - i * u, `sand_${c}`).setOrigin(0.5, 1).setDisplaySize(w - 10, u)))
  const g = scene.add.graphics()
  g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2, -h / 2, w, h, { tl: 6, tr: 6, bl: 14, br: 14 })
  g.lineStyle(3, 0xffffff, 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, { tl: 6, tr: 6, bl: 14, br: 14 })
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 6, -h / 2 + 10, 5, h - 30, 3)
  box.add(g)
  return box
}

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create() {
    background(this, ['#7c4a12', '#1f1004'], 0xfde68a)
    this.cameras.main.fadeIn(300, 4, 20, 36)

    const sets = [[0, 3, 0], [2, 2, 8, 2], [6, 6, 4], [9, 1, 9, 1], [5, 10]]
    sets.forEach((layers, i) => {
      const f = miniFlask(this, W / 2 + (i - 2) * 92, 150, layers)
      this.tweens.add({ targets: f, angle: { from: -3, to: 3 }, y: 150 - 6, duration: 1600 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    })
    // A thin stream of sand falling from the top.
    this.add.particles(W / 2 + 92, 40, 'spark', {
      speedY: { min: 120, max: 200 }, speedX: { min: -8, max: 8 }, lifespan: 600, scale: { start: 0.4, end: 0.15 }, frequency: 50,
      tint: [hex(2), hex(1)],
    })

    const title = text(this, W / 2, 285, 'Sand Sort', 74, '#fde68a', { fontStyle: 'bold', stroke: '#2a1606', strokeThickness: 8 }).setOrigin(0.5)
    text(this, W / 2, 352, 'S T U D I O', 36, '#fbbf24', { fontStyle: 'bold', stroke: '#2a1606', strokeThickness: 6 }).setOrigin(0.5)
    this.tweens.add({ targets: title, scale: 1.04, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    text(this, W / 2, 400, 'Pour the sand. Sort every colour.', 21, '#fde68a').setOrigin(0.5)

    const stars = Object.values(data.stars).reduce((a, b) => a + b, 0)
    const done = Object.keys(data.stars).length
    button(this, W / 2, 490, '⏳  Journey', () => this.journey(), { w: 400, h: 62, size: 28, color: 0xb45309 })
    text(this, W / 2, 535, `${done}/${TOTAL_LEVELS} levels · ${stars}★`, 16, '#fcd34d').setOrigin(0.5)
    button(this, W / 2, 605, '⏱  Rush', () => fade(this, 'game', { mode: 'rush' }), { w: 400, h: 62, size: 28, color: 0xdb2777 })
    text(this, W / 2, 650, data.bestRush ? `Best ${data.bestRush} puzzles in 2 minutes` : '2 minutes — sort as many as you can', 16, '#f9a8d4').setOrigin(0.5)

    WORLDS.forEach((w, i) => this.add.circle(W / 2 + (i - 2) * 34, 715, 10, w.color))
    text(this, W / 2, 755, 'Tap a tube, then tap where to pour', 17, '#fde68a').setOrigin(0.5)
    text(this, W / 2, H - 55, '🧪 split flasks  ·  🔒 locked tubes  ·  ✨ colour-changing sand', 14, '#a8a29e').setOrigin(0.5)
  }

  journey() {
    fade(this, 'levels', { world: Math.floor((Math.min(data.unlocked, TOTAL_LEVELS) - 1) / 12) })
  }
}
