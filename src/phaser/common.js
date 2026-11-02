import { PALETTE, mulberry32 } from '../game.js'

export const W = 640
export const H = 860
export const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
export const hex = (i) => Number.parseInt(PALETTE[i].slice(1), 16)

function canvas(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return
  const t = scene.textures.createCanvas(key, w, h)
  draw(t.getContext(), w, h)
  t.refresh()
}

export function makeTextures(scene) {
  // One grainy sand layer per colour; stretched to the unit size in the scene.
  PALETTE.forEach((color, i) => {
    canvas(scene, `sand_${i}`, 64, 64, (ctx) => {
      const rnd = mulberry32(i * 97 + 5)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 64, 64)
      const shade = ctx.createLinearGradient(0, 0, 0, 64)
      shade.addColorStop(0, 'rgba(255,255,255,0.28)')
      shade.addColorStop(0.5, 'rgba(255,255,255,0)')
      shade.addColorStop(1, 'rgba(0,0,0,0.22)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, 64, 64)
      for (let k = 0; k < 150; k++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.3)'
        ctx.fillRect(rnd() * 64, rnd() * 64, 1.5 + rnd(), 1.5 + rnd())
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(0, 0, 64, 3)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(0, 61, 64, 3)
    })
  })

  canvas(scene, 'lock', 44, 54, (ctx) => {
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(22, 20, 12, Math.PI, 0)
    ctx.lineTo(34, 26)
    ctx.moveTo(10, 20)
    ctx.lineTo(10, 26)
    ctx.stroke()
    ctx.fillStyle = '#fbbf24'
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(4, 24, 36, 28, 6)
    ctx.fill()
    ctx.stroke()
  })
  canvas(scene, 'cork', 64, 22, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 22)
    grad.addColorStop(0, '#fde68a')
    grad.addColorStop(1, '#b45309')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(2, 2, 60, 18, 8)
    ctx.fill()
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2.5
    ctx.stroke()
  })
  canvas(scene, 'spark', 16, 16, (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(8, 8, 8, 0, Math.PI * 2)
    ctx.fill()
  })
  canvas(scene, 'glow', 128, 128, (ctx) => {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
  })
}

export function background(scene, [c1, c2], tint = 0x7dd3fc) {
  const key = `bg${c1}${c2}`
  canvas(scene, key, 64, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, H)
  })
  scene.add.image(W / 2, H / 2, key).setDisplaySize(W, H).setDepth(-100)
  scene.add
    .particles(0, 0, 'spark', {
      x: { min: 0, max: W },
      y: H + 10,
      speedY: { min: -60, max: -20 },
      speedX: { min: -10, max: 10 },
      lifespan: 9000,
      scale: { start: 0.4, end: 0.1 },
      alpha: { start: 0.35, end: 0 },
      frequency: 240,
      tint,
    })
    .setDepth(-90)
}

export function button(scene, x, y, label, fn, { w = 200, h = 54, size = 22, color = 0x0284c7, textColor = '#fff' } = {}) {
  const box = scene.add.container(x, y)
  const bg = scene.add.graphics()
  const draw = (fill, alpha) => {
    bg.clear()
    bg.fillStyle(fill, alpha).fillRoundedRect(-w / 2, -h / 2, w, h, 14)
    bg.lineStyle(2, 0xffffff, 0.3).strokeRoundedRect(-w / 2, -h / 2, w, h, 14)
  }
  draw(color, 0.92)
  const t = scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color: textColor }).setOrigin(0.5)
  box.add([bg, t])
  box.setSize(w, h).setInteractive({ useHandCursor: true })
  box.on('pointerover', () => draw(color, 1))
  box.on('pointerout', () => draw(color, 0.92))
  box.on('pointerdown', () => {
    scene.tweens.add({ targets: box, scale: 0.94, duration: 70, yoyo: true })
    fn()
  })
  box.setLabel = (s) => t.setText(s)
  return box
}

export const text = (scene, x, y, str, size = 22, color = '#fff', extra = {}) =>
  scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...extra })

export function fade(scene, to, data) {
  scene.input.enabled = false
  scene.cameras.main.fadeOut(220, 4, 20, 36)
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(to, data))
}

