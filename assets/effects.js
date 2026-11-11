/* Event-driven feedback. No animation loop runs while the game is idle. */
class GameEffects {
  constructor() {
    this.full = true;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.animations = new Set();
    this.particles = [];
    this.frame = 0;
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.layer.append(this.canvas);
    document.body.append(this.layer);
    this.ctx = this.canvas.getContext('2d');
    this.reduced.addEventListener('change', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('resize', () => this.clear());
  }
  get moving() { return this.full && !this.reduced.matches && !document.hidden; }
  setFull(value) {
    this.full = value;
    document.documentElement.dataset.effects = value ? 'full' : 'calm';
    this.clear();
  }
  stage(parent = document.body) {
    this.clear();
    parent.append(this.layer);
    this.layer.classList.toggle('in-dialog', parent.tagName === 'DIALOG');
  }
  clear() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.particles.length = 0;
    this.animations.forEach(animation => animation.cancel());
    this.animations.clear();
    this.layer.querySelectorAll('.fx-label, .fx-token').forEach(label => label.remove());
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  animate(element, frames, options = {}) {
    if (!this.moving || !element?.animate) return;
    const animation = element.animate(frames, { duration: 400, easing: 'cubic-bezier(.16,1,.3,1)', ...options });
    this.animations.add(animation);
    const done = () => this.animations.delete(animation);
    animation.finished.then(done, done);
    return animation;
  }
  point(element) {
    const r = element.getBoundingClientRect(), origin = this.layer.getBoundingClientRect();
    return { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
  }
  fit() {
    const r = this.layer.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  burst(element, tier = 1, travelTo = null) {
    if (!this.moving || !this.ctx || !element) return;
    if (!this.frame) this.fit();
    const p = this.point(element), target = travelTo ? this.point(travelTo) : null;
    const colors = tier > 1 ? ['#ffe39c', '#fff4cd', '#bb9bff', '#77edcf'] : ['#d4ff9a', '#8af0d5', '#ffffff'];
    const count = Math.min(10 + tier * 8, 42), now = performance.now();
    for (let i = 0; i < count && this.particles.length < 120; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 110;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 60, start: now, life: 600 + Math.random()*450, size: 2 + Math.random()*3, color: colors[i%colors.length], target: target && i < 8 ? target : null });
    }
    if (!this.frame) this.frame = requestAnimationFrame(time => this.draw(time));
  }
  draw(time) {
    const r = this.layer.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    this.particles = this.particles.filter(p => time - p.start < p.life);
    for (const p of this.particles) {
      const t = Math.max(0, (time-p.start)/p.life), seconds = t*p.life/1000;
      let x = p.x+p.vx*seconds, y = p.y+p.vy*seconds+110*seconds*seconds;
      if (p.target) { const ease = t*t; x += (p.target.x-x)*ease; y += (p.target.y-y)*ease; }
      this.ctx.globalAlpha = (1-t)*.95;
      this.ctx.fillStyle = p.color;
      this.ctx.save();this.ctx.translate(x,y);this.ctx.rotate(t*5);
      this.ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*(p.target?1:1.7));this.ctx.restore();
    }
    this.ctx.globalAlpha = 1;
    this.frame = this.particles.length ? requestAnimationFrame(next => this.draw(next)) : 0;
  }
  label(element, text, gold = false) {
    if (!this.moving || !element) return;
    // Replace older callouts instead of stacking text over the board.
    this.layer.querySelectorAll('.fx-label').forEach(label => label.remove());
    const p = this.point(element), label = document.createElement('span');
    label.className = `fx-label${gold ? ' gold' : ''}`;
    label.textContent = text;
    label.style.left = `${Math.max(70, Math.min(this.layer.clientWidth-70, p.x))}px`;
    label.style.top = `${Math.max(45, p.y)}px`;
    this.layer.append(label);
    const animation = this.animate(label, [
      { opacity: 0, transform: 'translate(-50%, 6px) scale(.6)' },
      { opacity: 1, transform: 'translate(-50%, -12px) scale(1.08)', offset: .2 },
      { opacity: 1, transform: 'translate(-50%, -20px) scale(1)', offset: .65 },
      { opacity: 0, transform: 'translate(-50%, -48px) scale(.95)' }
    ], { duration: 1100 });
    animation?.finished.then(() => label.remove(), () => label.remove());
  }
  drawTile(rare = false) {
    const el = document.getElementById('queueTile');
    this.animate(el, [ { transform: 'translateY(-9px) rotate(-9deg) scale(.65)', opacity: .3 }, { transform: 'translateY(2px) rotate(3deg) scale(1.1)', opacity: 1, offset: .65 }, { transform: 'none', opacity: 1 } ], { duration: rare ? 540 : 280 });
    if (rare) { this.burst(el, 2); this.label(el, 'GOLD LETTER · +3', true); }
  }
  place(index, length, blank) {
    const lane = document.getElementById('gameBoard').children[index], cell = lane.children[1].children[length-1];
    this.animate(cell, [ { transform: 'translateY(-12px) scale(1.25)', opacity: .35 }, { transform: 'translateY(2px) scale(.92)', opacity: 1, offset: .65 }, { transform: 'none', opacity: 1 } ], { duration: 310 });
    if (blank) this.burst(cell, 2);
    if (length === 4) this.animate(lane.children[2], [{ transform: 'scale(.9)' }, { transform: 'scale(1.12)', offset: .5 }, { transform: 'none' }]);
  }
  bank(index, tiles, points, chain, milestone, personalBest) {
    const lane = document.getElementById('gameBoard').children[index], row = lane.children[1], score = document.getElementById('score');
    const tier = milestone || personalBest ? 3 : chain >= 3 || points >= 7 ? 2 : 1;
    const title = milestone ? 'FIVE WORDS! +5' : personalBest ? 'NEW PERSONAL BEST!' : chain >= 4 ? 'UNSTOPPABLE!' : chain === 3 ? 'ON FIRE!' : chain === 2 ? 'WORD FLOW!' : points >= 7 ? 'BRILLIANT!' : 'NICELY DONE!';
    document.getElementById('rewardTitle').textContent = title;
    document.getElementById('rewardDetail').textContent = `${tiles.map(t=>t.letter).join('')}  +${points}${chain>1 ? ` · combo +${chain-1}` : ''}`;
    document.getElementById('rewardCard').dataset.tier = tier;
    this.animate(document.getElementById('rewardCard'), [{ transform: 'scale(.96)', opacity: .55 }, { transform: 'scale(1.02)', opacity: 1, offset: .6 }, { transform: 'none', opacity: 1 }]);
    this.animate(lane, [{ borderColor: '#ffe39c', background: '#3c4940' }, { borderColor: '#30404a', background: '#14212a' }], { duration: 800 });
    if (this.moving) for (let i=0; i<tiles.length; i++) {
      const from = this.point(row.children[i]), to = this.point(score), ghost = document.createElement('span');
      ghost.className = `fx-token${tiles[i].blank?' blank':PentaCore.bonus.includes(tiles[i].letter)?' gold':''}`;
      ghost.textContent = tiles[i].letter;ghost.style.left = `${from.x}px`;ghost.style.top = `${from.y}px`;
      this.layer.append(ghost);
      const dx = to.x-from.x, dy = to.y-from.y;
      const animation = this.animate(ghost, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx*.25}px),calc(-50% + ${dy*.4-35}px)) scale(1.15)`, opacity: 1, offset: .4 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.1)`, opacity: 0 }], { duration: 650, delay: i*25, easing: 'cubic-bezier(.4,0,.6,1)' });
      animation?.finished.then(() => ghost.remove(), () => ghost.remove());
    }
    this.burst(lane, tier, score);
    this.label(lane, `+${points}${milestone?' +5':''}`, tier>1);
    this.animate(score, [{ transform: 'scale(1.35)', color: '#ffe39c' }, { transform: 'scale(1)', color: '#c4f17b' }], { duration: 650 });
    if (chain>1) this.animate(document.getElementById('combo'), [{ transform: 'scale(1.4) rotate(-7deg)' }, { transform: 'none' }]);
  }
  reject(index) {
    this.animate(document.getElementById('gameBoard').children[index], [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)', offset: .25 }, { transform: 'translateX(4px)', offset: .5 }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' });
  }
  finish(best) {
    const dialog = document.getElementById('resultDialog');
    this.stage(dialog);
    this.animate(document.getElementById('resultMedal'), [{ transform: 'scale(.3) rotate(-25deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(5deg)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], { duration: 700 });
    this.burst(document.getElementById('resultMedal'), best ? 4 : 2);
    this.animate(document.getElementById('resultScore'), [{ transform: 'translateY(12px) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650 });
  }
}
