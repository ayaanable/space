import Phaser from 'phaser';
import './style.css';

const WIDTH = 1280;
const HEIGHT = 720;
const SAVE_KEY = 'starfall-save';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.save = { best: 0, fragments: 0, muted: false, upgrades: { engine: 0, weapons: 0, shield: 0, armor: 0, dash: 0 } };
  }

  create() {
    this.loadSave();
    this.createBackground();
    this.createTextures();
    this.player = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, angle: 0, hp: 100, shield: 60, maxHp: 100, maxShield: 60, invulnerable: 0, dash: 0 };
    this.bullets = [];
    this.comets = [];
    this.fragments = [];
    this.particles = [];
    this.score = 0;
    this.wave = 1;
    this.destroyed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.waveBanner = 2.5;
    this.paused = false;
    this.over = false;
    this.lastShot = 0;
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC');
    this.pointer = this.input.activePointer;
    this.fireHeld = false;
    this.input.on('pointerdown', () => { this.fireHeld = true; this.audioBeep(440, 0.025); });
    this.input.on('pointerup', () => { this.fireHeld = false; });
    this.input.keyboard.on('keydown-SPACE', () => this.dash());
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-M', () => this.toggleMute());
    this.hud = this.add.text(28, 24, '', { fontFamily: 'Arial', fontSize: '18px', color: '#d9e8ff', lineSpacing: 8 }).setDepth(20);
    this.tip = this.add.text(WIDTH / 2, HEIGHT - 32, 'WASD / ARROWS MOVE   •   MOUSE AIM + HOLD FIRE   •   SPACE DASH   •   ESC PAUSE', { fontFamily: 'Arial', fontSize: '13px', color: '#7890ae' }).setOrigin(0.5).setDepth(20);
    this.banner = this.add.text(WIDTH / 2, HEIGHT / 2 - 190, 'WAVE 1', { fontFamily: 'Arial', fontSize: '34px', fontStyle: 'bold', color: '#8ce7ff', stroke: '#071221', strokeThickness: 8 }).setOrigin(0.5).setDepth(20);
    this.overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x040713, 0.82).setDepth(30).setVisible(false);
    this.overlayText = this.add.text(WIDTH / 2, HEIGHT / 2, '', { fontFamily: 'Arial', fontSize: '28px', align: 'center', color: '#ffffff', lineSpacing: 12 }).setOrigin(0.5).setDepth(31);
    this.spawnInitialWave();
  }

  loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      if (Number.isFinite(raw.best)) this.save.best = Math.max(0, raw.best);
      if (Number.isFinite(raw.fragments)) this.save.fragments = Math.max(0, raw.fragments);
      if (typeof raw.muted === 'boolean') this.save.muted = raw.muted;
      if (raw.upgrades) Object.keys(this.save.upgrades).forEach((key) => {
        if (Number.isFinite(raw.upgrades[key])) this.save.upgrades[key] = clamp(Math.floor(raw.upgrades[key]), 0, 5);
      });
    } catch { /* a broken save should never prevent a new run */ }
  }

  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  createBackground() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x050815);
    for (let i = 0; i < 110; i++) {
      const star = this.add.circle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), Phaser.Math.Between(1, 2), 0x8caad1, Phaser.Math.FloatBetween(0.15, 0.65));
      star.setScrollFactor(0.2);
      if (i % 4 === 0) star.setScale(1.7);
    }
    this.add.circle(1040, 130, 190, 0x3c1d6d, 0.07);
    this.add.circle(260, 620, 240, 0x0a6480, 0.055);
    this.add.circle(700, 330, 100, 0x1d4278, 0.04);
    this.add.line(0, 0, 0, 0, WIDTH, 0, 0x203252, 0.35).setOrigin(0);
  }

  createTextures() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0x78e6ff).fillTriangle(18, 0, -12, 10, -7, 0).fillTriangle(18, 0, -12, -10, -7, 0);
    g.fillStyle(0xd9fbff).fillCircle(2, 0, 4); g.generateTexture('ship', 42, 24); g.clear();
    g.fillStyle(0xffb45e).fillCircle(10, 10, 8); g.fillStyle(0x512b4e).fillCircle(7, 7, 3); g.generateTexture('small', 20, 20); g.clear();
    g.fillStyle(0xec7a61).fillCircle(18, 18, 16); g.fillStyle(0x632d4c).fillCircle(10, 10, 5); g.generateTexture('medium', 36, 36); g.clear();
    g.fillStyle(0xb95773).fillCircle(27, 27, 25); g.fillStyle(0x542c54).fillCircle(14, 14, 8); g.generateTexture('large', 54, 54); g.clear();
    g.fillStyle(0x7ef5ff).fillCircle(17, 17, 15); g.fillStyle(0xc9ffff).fillCircle(11, 11, 5); g.generateTexture('glow', 34, 34); g.clear();
    g.fillStyle(0xffd37e).fillCircle(4, 4, 4); g.generateTexture('fragment', 8, 8); g.destroy();
  }

  spawnInitialWave() { for (let i = 0; i < 4; i++) this.spawnComet('small'); }

  spawnComet(forcedType) {
    if (this.comets.length >= 18) return;
    const side = Phaser.Math.Between(0, 3);
    const margin = 50;
    const x = side === 0 ? -margin : side === 1 ? WIDTH + margin : Phaser.Math.Between(0, WIDTH);
    const y = side === 2 ? -margin : side === 3 ? HEIGHT + margin : Phaser.Math.Between(0, HEIGHT);
    const target = new Phaser.Math.Vector2(this.player.x + Phaser.Math.Between(-180, 180), this.player.y + Phaser.Math.Between(-130, 130));
    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y) + Phaser.Math.FloatBetween(-0.22, 0.22);
    const roll = Math.random();
    const type = forcedType || (this.wave >= 4 && roll < 0.12 ? 'large' : this.wave >= 2 && roll < 0.34 ? 'medium' : this.wave >= 3 && roll < 0.08 ? 'glow' : 'small');
    const stats = { small: [10, 1, 150, 10], medium: [18, 4, 30, 25], large: [28, 10, 18, 75], glow: [17, 5, 180, 150] }[type];
    const comet = { x, y, type, hp: stats[1] + Math.floor(this.wave / 4), maxHp: stats[1] + Math.floor(this.wave / 4), speed: stats[2] + this.wave * 3, score: stats[3], angle, rot: Phaser.Math.FloatBetween(-0.03, 0.03), r: stats[0], wobble: Phaser.Math.FloatBetween(0, 6.28), sprite: this.add.image(x, y, type).setDepth(5) };
    comet.sprite.setAngle(Phaser.Math.RadToDeg(angle)); this.comets.push(comet);
  }

  shoot() {
    const now = this.time.now; const rate = Math.max(85, 190 - this.save.upgrades.weapons * 18);
    if (now - this.lastShot < rate) return;
    this.lastShot = now;
    const angle = this.player.angle; const x = this.player.x + Math.cos(angle) * 23; const y = this.player.y + Math.sin(angle) * 23;
    const bullet = { x, y, vx: Math.cos(angle) * 720, vy: Math.sin(angle) * 720, life: 0.8, sprite: this.add.image(x, y, 'fragment').setTint(0x9ff4ff).setScale(1.5).setDepth(8) };
    this.bullets.push(bullet); this.audioBeep(620, 0.035);
    this.burst(x, y, 0x9ff4ff, 3, 50);
  }

  dash() {
    if (this.over || this.player.dash > 0) return;
    const boost = 320; this.player.vx += Math.cos(this.player.angle) * boost; this.player.vy += Math.sin(this.player.angle) * boost;
    this.player.invulnerable = 0.5; this.player.dash = Math.max(0.7, 2.5 - this.save.upgrades.dash * 0.3); this.burst(this.player.x, this.player.y, 0x78e6ff, 14, 180); this.audioBeep(180, 0.12);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.033);
    if (this.over || this.paused) return;
    this.player.angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.pointer.worldX, this.pointer.worldY);
    const moveX = (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
    const moveY = (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
    const speed = 250 + this.save.upgrades.engine * 28; const len = Math.hypot(moveX, moveY) || 1;
    this.player.vx = Phaser.Math.Linear(this.player.vx, moveX / len * speed, dt * 7);
    this.player.vy = Phaser.Math.Linear(this.player.vy, moveY / len * speed, dt * 7);
    this.player.x = clamp(this.player.x + this.player.vx * dt, 26, WIDTH - 26); this.player.y = clamp(this.player.y + this.player.vy * dt, 55, HEIGHT - 52);
    this.player.dash = Math.max(0, this.player.dash - dt); this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    if (this.fireHeld || this.pointer.isDown) this.shoot();
    this.updateObjects(dt); this.spawnTimer -= dt; this.waveTimer = Math.max(0, this.waveTimer - dt); this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    if (this.spawnTimer <= 0 && this.waveTimer <= 0) { this.spawnComet(); this.spawnTimer = Math.max(0.22, 1.05 - this.wave * 0.045); }
    if (this.comets.length === 0 && this.waveTimer <= 0) { this.waveTimer = 3; this.wave += 1; this.score += 100 * this.wave; this.save.fragments += 30 + this.wave * 5; this.waveBanner = 2.5; this.persist(); }
    this.renderPlayer(); this.renderHud(); this.renderBanner();
  }

  updateObjects(dt) {
    this.bullets = this.bullets.filter((b) => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.sprite.setPosition(b.x, b.y); if (b.life <= 0 || b.x < -20 || b.x > WIDTH + 20 || b.y < -20 || b.y > HEIGHT + 20) { b.sprite.destroy(); return false; } return true; });
    this.comets = this.comets.filter((c) => {
      c.wobble += dt; c.angle += Math.sin(c.wobble) * 0.002; c.x += Math.cos(c.angle) * c.speed * dt; c.y += Math.sin(c.angle) * c.speed * dt; c.sprite.setPosition(c.x, c.y).setRotation(c.sprite.rotation + c.rot);
      for (const b of this.bullets) if (!b.hit && distance(b, c) < c.r) { b.hit = true; c.hp -= 1 + this.save.upgrades.weapons; this.burst(b.x, b.y, c.type === 'glow' ? 0x92ffff : 0xffa56d, 5, 75); if (c.hp <= 0) { this.destroyComet(c); return false; } break; }
      if (distance(this.player, c) < c.r + 15 && this.player.invulnerable <= 0) { this.damage(16 + (c.type === 'large' ? 10 : 0)); c.hp = 0; this.destroyComet(c); return false; }
      if (c.x < -100 || c.x > WIDTH + 100 || c.y < -100 || c.y > HEIGHT + 100) { c.sprite.destroy(); return false; } return true;
    });
    this.bullets = this.bullets.filter((b) => { if (b.hit) { b.sprite.destroy(); return false; } return true; });
    this.fragments = this.fragments.filter((f) => { f.life -= dt; const d = distance(this.player, f); if (d < 110) { f.x = Phaser.Math.Linear(f.x, this.player.x, dt * 5); f.y = Phaser.Math.Linear(f.y, this.player.y, dt * 5); } f.sprite.setPosition(f.x, f.y).setRotation(f.sprite.rotation + dt * 4); if (d < 18) { this.save.fragments += 1; f.sprite.destroy(); return false; } if (f.life <= 0) { f.sprite.destroy(); return false; } return true; });
    this.particles = this.particles.filter((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.sprite.setPosition(p.x, p.y).setAlpha(Math.max(0, p.life / p.max)); if (p.life <= 0) { p.sprite.destroy(); return false; } return true; });
    if (this.player.shield < this.player.maxShield && this.player.invulnerable <= 0) this.player.shield = Math.min(this.player.maxShield, this.player.shield + dt * 3);
  }

  destroyComet(c) {
    c.sprite.destroy(); this.destroyed += 1; this.combo = Math.min(8, this.combo + 1); this.comboTimer = 2.2; this.score += c.score * (1 + Math.floor(this.combo / 3)); this.burst(c.x, c.y, c.type === 'glow' ? 0x9fffff : 0xff9a69, c.type === 'large' ? 24 : 12, c.type === 'large' ? 240 : 140); this.audioBeep(c.type === 'large' ? 90 : 250, 0.1);
    if (c.type === 'large') for (let i = 0; i < 3; i++) this.spawnComet('medium'); else if (c.type === 'medium') for (let i = 0; i < 2; i++) this.spawnComet('small');
    if (c.type !== 'small' || Math.random() < 0.28) { const f = { x: c.x, y: c.y, life: 8, sprite: this.add.image(c.x, c.y, 'fragment').setDepth(7) }; this.fragments.push(f); }
  }

  damage(amount) {
    let remaining = amount; const absorbed = Math.min(this.player.shield, remaining); this.player.shield -= absorbed; remaining -= absorbed; this.player.hp -= remaining; this.player.invulnerable = 0.9; this.cameras.main.flash(100, 255, 90, 90, false); this.burst(this.player.x, this.player.y, 0xff697f, 12, 130); this.audioBeep(110, 0.12);
    if (this.player.hp <= 0) this.gameOver();
  }

  burst(x, y, color, count, force) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2; const v = Math.random() * force; const p = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: Math.random() * 0.45 + 0.2, max: 0.65, sprite: this.add.circle(x, y, Math.random() * 2.5 + 1, color).setDepth(9) }; this.particles.push(p); } }
  renderPlayer() { if (!this.ship) this.ship = this.add.image(0, 0, 'ship').setDepth(10); this.ship.setPosition(this.player.x, this.player.y).setRotation(this.player.angle).setAlpha(this.player.invulnerable > 0 && Math.floor(this.time.now / 80) % 2 ? 0.25 : 1); }
  renderHud() { const bar = (value, max, size = 12) => '█'.repeat(Math.round(value / max * size)) + '░'.repeat(size - Math.round(value / max * size)); this.hud.setText(`STARFALL\n\nSCORE  ${this.score.toString().padStart(6, '0')}\nWAVE   ${this.wave}\n\nSHIELD ${bar(this.player.shield, this.player.maxShield)}\nHP     ${bar(this.player.hp, this.player.maxHp)}\n\nFRAGMENTS  ${this.save.fragments}\nCOMBO      ${this.combo ? `${this.combo}x` : '—'}\nSOUND      ${this.save.muted ? 'MUTED' : 'ON'}\n\nDASH  ${this.player.dash > 0 ? `${this.player.dash.toFixed(1)}s` : 'READY'}`); }
  renderBanner() { this.waveBanner -= 1 / 60; this.banner.setText(this.waveTimer > 0 ? `WAVE ${this.wave} CLEAR\n+${100 * this.wave} SCORE` : `WAVE ${this.wave}`).setAlpha(this.waveBanner > 0 ? clamp(this.waveBanner, 0, 1) : 0); }
  togglePause() { if (this.over) return; this.paused = !this.paused; this.overlay.setVisible(this.paused); this.overlayText.setText(this.paused ? 'PAUSED\n\nESC  RESUME' : '').setVisible(this.paused); }
  toggleMute() { this.save.muted = !this.save.muted; this.persist(); }
  gameOver() { this.over = true; this.save.best = Math.max(this.save.best, this.score); this.persist(); this.overlay.setVisible(true); this.overlayText.setText(`SHIP LOST\n\nSCORE  ${this.score}\nWAVE   ${this.wave}\nBEST   ${this.save.best}\n\nCLICK TO RETRY`); this.input.once('pointerdown', () => this.scene.restart()); }
  audioBeep(frequency, duration) { if (this.save.muted) return; if (!this.audioCtx) this.audioCtx = new AudioContext(); const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain(); osc.frequency.value = frequency; gain.gain.setValueAtTime(0.035, this.audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration); osc.connect(gain).connect(this.audioCtx.destination); osc.start(); osc.stop(this.audioCtx.currentTime + duration); }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, backgroundColor: '#050815', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, input: { activePointers: 3 }, scene: [GameScene], render: { antialias: true, roundPixels: true } });
