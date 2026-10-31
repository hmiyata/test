// MPC-60 Retro Web Audio Synthesizer Engine
// Self-contained, zero-network, 12-bit lo-fi aesthetic

class MPCSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.crusher = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Subtle 12-bit / Roger Linn saturation curve
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = this.createDistortionCurve(15);
    this.shaper.oversample = 'none';

    // Master filter (slight vintage warm roll-off at 14kHz)
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
      // 12-bit step quantization simulation + soft clipping
      const steps = 4096; // 12-bit resolution
      const quantized = Math.round(x * steps) / steps;
      curve[i] = ((3 + k) * quantized * 20 * deg) / (Math.PI + k * Math.abs(quantized));
    }
    return curve;
  }

  // Play a specific track (0 to 7) at a scheduled time with velocity (0 to 1)
  triggerTrack(trackIndex, time = null, velocity = 0.9, pitch = null) {
    this.ensureContext();
    if (!this.ctx) return;
    const t = time ?? this.ctx.currentTime;
    const vel = Math.max(0.1, Math.min(1.0, velocity));

    switch (trackIndex) {
      case 0: // Kick
        this.playKick(t, vel);
        break;
      case 1: // Snare
        this.playSnare(t, vel);
        break;
      case 2: // Closed Hat
        this.playClosedHat(t, vel);
        break;
      case 3: // Open Hat
        this.playOpenHat(t, vel);
        break;
      case 4: // Clap / Rim
        this.playClap(t, vel);
        break;
      case 5: // Perc / Shaker / Tom
        this.playPerc(t, vel);
        break;
      case 6: // Sub Bass
        this.playBass(t, vel, pitch);
        break;
      case 7: // Vinyl Chop / Chord
        this.playChop(t, vel, pitch);
        break;
    }
  }

  // 1. MPC Punchy Boom Kick
  playKick(t, vel) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Pitch envelope: snap from 150Hz -> 42Hz
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.28);

    // Amp envelope
    gain.gain.setValueAtTime(1.2 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    // Beater click (5ms noise transient)
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(400, t);
    click.frequency.exponentialRampToValueAtTime(60, t + 0.02);
    clickGain.gain.setValueAtTime(0.6 * vel, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    click.connect(clickGain);
    gain.connect(this.shaper);
    clickGain.connect(this.shaper);

    osc.start(t);
    click.start(t);
    osc.stop(t + 0.35);
    click.stop(t + 0.03);
  }

  // 2. Gritty 12-bit Snare
  playSnare(t, vel) {
    // Tonal body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.07);
    oscGain.gain.setValueAtTime(0.7 * vel, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    // Noise snap
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1400, t);
    noiseFilter.Q.setValueAtTime(1.8, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.1 * vel, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(oscGain);
    oscGain.connect(this.shaper);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.shaper);

    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.15);
    noise.stop(t + 0.22);
  }

  // 3. Closed Hat
  playClosedHat(t, vel) {
    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);

    noise.start(t);
    noise.stop(t + 0.06);
  }

  // 4. Open Hat
  playOpenHat(t, vel) {
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);

    noise.start(t);
    noise.stop(t + 0.38);
  }

  // 5. Handclap
  playClap(t, vel) {
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, t);
    filter.Q.setValueAtTime(2.2, t);

    const gain = this.ctx.createGain();
    // 3 micro-bursts for authentic clap spread
    gain.gain.setValueAtTime(0.7 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.012);
    gain.gain.setValueAtTime(0.8 * vel, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.026);
    gain.gain.setValueAtTime(1.0 * vel, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);

    noise.start(t);
    noise.stop(t + 0.24);
  }

  // 6. Perc / Rimshot / Shaker
  playPerc(t, vel) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(860, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.04);

    gain.gain.setValueAtTime(0.75 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.shaper);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 7. Warm Boombap Sub Bass
  playBass(t, vel, note = 0) {
    // note: chromatic offset from D1 (~36.7Hz)
    const baseFreq = 38.89; // D#1 / Eb1
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
    gain.gain.linearRampToValueAtTime(1.0 * vel, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.shaper);

    osc.start(t);
    osc.stop(t + 0.48);
  }

  // 8. Vinyl Jazz Chord Chop (Rhodes / EP stab)
  playChop(t, vel, chordIndex = 0) {
    // Chords: 0=Fm7, 1=Bbm7, 2=Eb7, 3=Abmaj7
    const chords = [
      [174.61, 207.65, 261.63, 311.13], // Fm7
      [233.08, 277.18, 349.23, 415.30], // Bbm7
      [155.56, 196.00, 233.08, 277.18], // Eb7
      [207.65, 261.63, 311.13, 392.00], // Abmaj7
    ];
    const freqs = chords[(chordIndex || 0) % chords.length];

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, t);
    chordGain.gain.linearRampToValueAtTime(0.55 * vel, t + 0.02);
    chordGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(1.2, t);

    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.6);
    });

    filter.connect(chordGain);
    chordGain.connect(this.shaper);
  }
}

window.MPCSynth = MPCSynth;
