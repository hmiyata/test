// AOI LOB60 Professional Synthesizer Engine
// Self-contained, zero-network, 12-bit lo-fi MPC acoustic modeling

class MPCSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.shaper = null;
    this.masterFilter = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Subtle 12-bit lo-fi saturation curve
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = this.createDistortionCurve(15);
    this.shaper.oversample = 'none';

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(14000, this.ctx.currentTime);

    this.shaper.connect(this.masterFilter);
    this.masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.initialized = true;
  }

  ensureContext() {
    if (!this.initialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createDistortionCurve(amount = 20) {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      const steps = 4096; // 12-bit resolution
      const quantized = Math.round(x * steps) / steps;
      curve[i] = ((3 + k) * quantized * 20 * deg) / (Math.PI + k * Math.abs(quantized));
    }
    return curve;
  }

  // 1. Kick (Punchy Boom)
  playKick(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.28);

    gain.gain.setValueAtTime(1.2 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(450, t);
    click.frequency.exponentialRampToValueAtTime(60, t + 0.02);
    clickGain.gain.setValueAtTime(0.6 * v, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    click.connect(clickGain);
    gain.connect(this.shaper);
    clickGain.connect(this.shaper);

    osc.start(t); click.start(t);
    osc.stop(t + 0.35); click.stop(t + 0.03);
  }

  // 2. Snare (12-bit Snap)
  playSnare(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.07);
    oscGain.gain.setValueAtTime(0.7 * v, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1400, t);
    noiseFilter.Q.setValueAtTime(1.8, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.1 * v, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(oscGain);
    oscGain.connect(this.shaper);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.shaper);

    osc.start(t); noise.start(t);
    osc.stop(t + 0.15); noise.stop(t + 0.22);
  }

  // 3. Closed Hi-Hat
  playClosedHat(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);
    noise.start(t); noise.stop(t + 0.06);
  }

  // 4. Open Hi-Hat
  playOpenHat(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);
    noise.start(t); noise.stop(t + 0.38);
  }

  // 5. Handclap
  playClap(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, t);
    filter.Q.setValueAtTime(2.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.012);
    gain.gain.setValueAtTime(0.8 * v, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.026);
    gain.gain.setValueAtTime(1.0 * v, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);
    noise.start(t); noise.stop(t + 0.24);
  }

  // 6. Crash Cymbal (Long explosive splashy sizzle)
  playCrash(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Highpass wash
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(4500, t);

    // Resonant metallic band
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(7500, t);
    bp.Q.setValueAtTime(1.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.1 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(this.shaper);

    noise.start(t);
    noise.stop(t + 1.35);
  }

  // 7. Ride Cymbal (Distinct metallic bell ping + shimmering sustain)
  playRide(time = null, vel = 1.0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    // Metallic Bell Ping (Ring-modulated dual tone)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(840, t);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2450, t);
    oscGain.gain.setValueAtTime(0.75 * v, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    // Shimmering metallic tail
    const bufferSize = this.ctx.sampleRate * 0.9;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5 * v, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(this.shaper);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.shaper);

    osc1.start(t); osc2.start(t); noise.start(t);
    osc1.stop(t + 0.6); osc2.stop(t + 0.6); noise.stop(t + 0.9);
  }

  // 8. Toms (Tuned: Tom 1 High, Tom 2 Mid < Tom 1, Tom 3 Low < Tom 2)
  playTom(time = null, vel = 1.0, level = 1) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    // Pitches: Tom 1 = High (~190Hz), Tom 2 = Mid (~130Hz), Tom 3 = Low (~85Hz)
    const tomSpecs = {
      1: { start: 195, end: 110, dur: 0.22 }, // High Tom
      2: { start: 135, end: 78,  dur: 0.26 }, // Mid Tom (clearly lower than Tom 1)
      3: { start: 88,  end: 48,  dur: 0.36 }  // Low Tom (clearly lower than Tom 2)
    }[level] || { start: 135, end: 78, dur: 0.26 };

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tomSpecs.start, t);
    osc.frequency.exponentialRampToValueAtTime(tomSpecs.end, t + tomSpecs.dur * 0.7);

    gain.gain.setValueAtTime(1.15 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + tomSpecs.dur);

    // Beater Click
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(480, t);
    click.frequency.exponentialRampToValueAtTime(70, t + 0.015);
    clickGain.gain.setValueAtTime(0.55 * v, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    click.connect(clickGain);
    gain.connect(this.shaper);
    clickGain.connect(this.shaper);

    osc.start(t); click.start(t);
    osc.stop(t + tomSpecs.dur + 0.05); click.stop(t + 0.025);
  }

  // 9. Congas (High slap vs Low open body)
  playConga(time = null, vel = 1.0, isHigh = true) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';

    if (isHigh) {
      // High Conga: tight resonant slap
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(360, t + 0.06);
      gain.gain.setValueAtTime(1.05 * v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    } else {
      // Low Conga: warm deep resonant body
      osc.frequency.setValueAtTime(230, t);
      osc.frequency.exponentialRampToValueAtTime(175, t + 0.09);
      gain.gain.setValueAtTime(1.15 * v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    }

    osc.connect(gain);
    gain.connect(this.shaper);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // 10. Bass (Boombap 808 Sub)
  playBass(time = null, vel = 1.0, note = 0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    const baseFreq = 38.89; // D#1
    const freq = baseFreq * Math.pow(2, (note || 0) / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.35);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(1.0 * v, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);

    osc.start(t);
    osc.stop(t + 0.48);
  }

  // 11. Chords (Lush Rhodes stabs: 0 = Fm7, 1 = Bbm7)
  playChop(time = null, vel = 1.0, chordIndex = 0) {
    this.ensureContext();
    const t = time ?? this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(1.0, vel));

    // Two distinctly different, soulful chords!
    // Chord 1 (idx 0): Fm7 = [F3 (174.61), Ab3 (207.65), C4 (261.63), Eb4 (311.13)]
    // Chord 2 (idx 1): Bbm7 = [Bb3 (233.08), Db4 (277.18), F4 (349.23), Ab4 (415.30)]
    const chords = [
      [174.61, 207.65, 261.63, 311.13], // CHORD 1 (Fm7)
      [233.08, 277.18, 349.23, 415.30], // CHORD 2 (Bbm7)
    ];
    const freqs = chords[(chordIndex || 0) % chords.length];

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, t);
    chordGain.gain.linearRampToValueAtTime(0.6 * v, t + 0.02);
    chordGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1250, t);
    filter.Q.setValueAtTime(1.2, t);

    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.7);
    });

    filter.connect(chordGain);
    chordGain.connect(this.shaper);
  }

  // Legacy track trigger compatibility
  triggerTrack(trackIndex, time = null, velocity = 0.9, pitch = null) {
    switch (trackIndex) {
      case 0: this.playKick(time, velocity); break;
      case 1: this.playSnare(time, velocity); break;
      case 2: this.playClosedHat(time, velocity); break;
      case 3: this.playOpenHat(time, velocity); break;
      case 4: this.playClap(time, velocity); break;
      case 5: this.playConga(time, velocity, true); break;
      case 6: this.playBass(time, velocity, pitch); break;
      case 7: this.playChop(time, velocity, pitch || 0); break;
    }
  }
}

window.MPCSynth = MPCSynth;
