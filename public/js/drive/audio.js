// Sons synthétisés (aucun fichier) : moteur, roulement, freins, klaxon, portes, notes.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // Moteur de traction : deux dents de scie filtrées
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.motorA = ctx.createOscillator();
    this.motorB = ctx.createOscillator();
    this.motorA.type = 'sawtooth';
    this.motorB.type = 'square';
    this.motorA.connect(lp);
    this.motorB.connect(lp);
    lp.connect(this.motorGain).connect(this.master);
    this.motorA.start();
    this.motorB.start();

    // Bruit blanc partagé
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Roulement
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    const rollF = ctx.createBiquadFilter();
    rollF.type = 'bandpass';
    rollF.frequency.value = 180;
    rollF.Q.value = 0.7;
    this.loopNoise(rollF);
    rollF.connect(this.rollGain).connect(this.master);
    this.rollF = rollF;

    // Freins (sifflement)
    this.brakeGain = ctx.createGain();
    this.brakeGain.gain.value = 0;
    const brF = ctx.createBiquadFilter();
    brF.type = 'highpass';
    brF.frequency.value = 2500;
    this.loopNoise(brF);
    brF.connect(this.brakeGain).connect(this.master);

    // Klaxon : deux tons
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    for (const f of [311, 370]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = 1400;
      o.connect(f2).connect(this.hornGain);
      o.start();
    }
    this.hornGain.connect(this.master);
  }

  loopNoise(dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.connect(dest);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  update(run) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = run.v;
    const traction = Math.max(0, run.lever) * (run.phase === 'run' ? 1 : 0);
    const f = 38 + v * 5.2;
    this.motorA.frequency.setTargetAtTime(f, t, 0.08);
    this.motorB.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    this.motorGain.gain.setTargetAtTime(v > 0.2 || traction > 0 ? 0.025 + traction * 0.06 : 0, t, 0.1);
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, v / 30) * 0.5, t, 0.1);
    this.rollF.frequency.setTargetAtTime(120 + v * 8, t, 0.1);
    const brake = run.lever < 0 && v > 0.3 ? Math.min(1, -run.lever) : 0;
    this.brakeGain.gain.setTargetAtTime(brake * 0.05 + (run.slip ? 0.06 : 0), t, 0.05);
  }

  horn(on) {
    if (!this.ctx) return;
    this.hornGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.02);
  }

  tone(freq, dur, type = 'sine', vol = 0.15, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  chime() { this.tone(659, 0.5, 'sine', 0.12); this.tone(523, 0.7, 'sine', 0.12, 0.28); }
  doorBeep() { for (let i = 0; i < 4; i++) this.tone(1180, 0.08, 'square', 0.05, i * 0.16); }
  perfect() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, i * 0.07)); }
  good() { [523, 784].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.09, i * 0.08)); }
  bad() { this.tone(160, 0.35, 'sawtooth', 0.1); }
  alarm() { for (let i = 0; i < 3; i++) this.tone(960, 0.12, 'square', 0.06, i * 0.18); }
  click() { this.tone(1600, 0.03, 'square', 0.03); }
  // passage d'une gare à pleine vitesse : souffle qui descend (effet Doppler)
  whoosh() { this.tone(880, 0.18, 'sawtooth', 0.04); this.tone(520, 0.3, 'sawtooth', 0.04, 0.12); }
}
