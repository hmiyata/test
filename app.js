// AOI LOB60 Sampler Workstation App Logic
// Pro Sound Synthesis Mapping, 16 Pads, Orange ERASE Mode, 8 Tracks

(function () {
  const synth = new MPCSynth();

  let state = {
    bpm: 92,
    isPlaying: false,
    isRecording: false,
    armedTrack: 1,
    bars: [
      { id: 'b1', name: 'Bar 1', colorIdx: 0 },
      { id: 'b2', name: 'Bar 2', colorIdx: 1 },
      { id: 'b3', name: 'Bar 3', colorIdx: 2 },
      { id: 'b4', name: 'Bar 4', colorIdx: 3 },
      { id: 'b5', name: 'Bar 5', colorIdx: 4 },
      { id: 'b6', name: 'Bar 6', colorIdx: 5 },
    ],
    // 16 Pads x 8 Steps in Track 1 Drum Loop
    drumHits: Array(16).fill(null).map(() => Array(8).fill(false)),
    metrics: {
      bpm: 92,
      bars_count: 6,
      pads_count: 16
    }
  };

  // Default groove in Track 1
  state.drumHits[0][0] = true; // Kick on 0
  state.drumHits[0][4] = true; // Kick on 4
  state.drumHits[1][2] = true; // Snare on 2
  state.drumHits[1][6] = true; // Snare on 6
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(s => state.drumHits[2][s] = true); // Closed Hat
  state.drumHits[4][6] = true; // Clap on 6

  let currentStep = 0;
  let currentBarIndex = 0;
  let nextStepTime = 0;
  let timer = null;

  // 16 Pads with exact instrument mapping
  const PADS = [
    { id: 0, label: 'KICK', type: 'kick' },
    { id: 1, label: 'SNARE', type: 'snare' },
    { id: 2, label: 'HH CLS', type: 'ch' },
    { id: 3, label: 'HH OPN', type: 'oh' },
    { id: 4, label: 'CLAP', type: 'clap' },
    { id: 5, label: 'CONGA H', type: 'conga_h' }, // Perc 1 = High Conga
    { id: 6, label: 'CONGA L', type: 'conga_l' }, // Perc 2 = Low Conga
    { id: 7, label: 'CRASH', type: 'crash' },     // Real Crash Cymbal
    { id: 8, label: 'RIDE', type: 'ride' },       // Real Ride Cymbal Ping
    { id: 9, label: 'TOM 1', type: 'tom1' },      // High Tom
    { id: 10, label: 'TOM 2', type: 'tom2' },     // Mid Tom (lower than Tom 1)
    { id: 11, label: 'TOM 3', type: 'tom3' },     // Low Tom (lower than Tom 2)
    { id: 12, label: 'BASS', type: 'bass' },
    { id: 13, label: 'CHORD 1', type: 'chord1' }, // Fm7
    { id: 14, label: 'CHORD 2', type: 'chord2' }, // Bbm7
    { id: 15, label: 'FX', type: 'fx' },
  ];

  function playInstrument(padType, time = null, vel = 1.0) {
    switch (padType) {
      case 'kick': synth.playKick(time, vel); break;
      case 'snare': synth.playSnare(time, vel); break;
      case 'ch': synth.playClosedHat(time, vel); break;
      case 'oh': synth.playOpenHat(time, vel); break;
      case 'clap': synth.playClap(time, vel); break;
      case 'conga_h': synth.playConga(time, vel, true); break;  // High Conga
      case 'conga_l': synth.playConga(time, vel, false); break; // Low Conga
      case 'crash': synth.playCrash(time, vel); break;          // Crash
      case 'ride': synth.playRide(time, vel); break;            // Ride
      case 'tom1': synth.playTom(time, vel, 1); break;          // Tom 1 High
      case 'tom2': synth.playTom(time, vel, 2); break;          // Tom 2 Mid
      case 'tom3': synth.playTom(time, vel, 3); break;          // Tom 3 Low
      case 'bass': synth.playBass(time, vel, 0); break;
      case 'chord1': synth.playChop(time, vel, 0); break;       // Fm7
      case 'chord2': synth.playChop(time, vel, 1); break;       // Bbm7
      case 'fx': synth.playConga(time, vel * 0.8, true); break;
    }
  }

  // 8 Audio Tracks
  const TRACKS = [
    { num: 1, name: 'Drum Loop', tag: 'OVERDUB (1 BAR)', isDrum: true, color: '#3a86ff' },
    { num: 2, name: 'Mic/Line 2', tag: 'AUDIO INPUT', isDrum: false, color: '#7cb518' },
    { num: 3, name: 'Mic/Line 3', tag: 'AUDIO INPUT', isDrum: false, color: '#ffb703' },
    { num: 4, name: 'Mic/Line 4', tag: 'AUDIO INPUT', isDrum: false, color: '#2a9d8f' },
    { num: 5, name: 'Mic/Line 5', tag: 'AUDIO INPUT', isDrum: false, color: '#9d4edd' },
    { num: 6, name: 'Mic/Line 6', tag: 'AUDIO INPUT', isDrum: false, color: '#e76f51' },
    { num: 7, name: 'Mic/Line 7', tag: 'AUDIO INPUT', isDrum: false, color: '#00b4d8' },
    { num: 8, name: 'Mic/Line 8', tag: 'AUDIO INPUT', isDrum: false, color: '#ff006e' },
  ];

  // DOM
  const bpmInput = document.getElementById('bpm-input');
  const playBtn = document.getElementById('btn-play');
  const stopBtn = document.getElementById('btn-stop');
  const recEraseBtn = document.getElementById('btn-rec-erase');
  const recLabel = document.getElementById('rec-label');
  const eraseHint = document.getElementById('erase-mode-hint');
  const metroLeds = [
    document.getElementById('led-1'),
    document.getElementById('led-2'),
    document.getElementById('led-3'),
    document.getElementById('led-4')
  ];
  const barsTimeline = document.getElementById('bars-timeline');
  const tracksList = document.getElementById('tracks-list');
  const padsGrid = document.getElementById('pads-grid');

  function init() {
    renderArranger();
    renderTracks();
    renderPads();
    setupEvents();
  }

  // Visual LED Metronome Flash (Silent pulse)
  function flashMetronome(beatIndex) {
    metroLeds.forEach((led, idx) => {
      if (idx === beatIndex) {
        led.classList.add('flash');
        setTimeout(() => led.classList.remove('flash'), 120);
      } else {
        led.classList.remove('flash');
      }
    });
  }

  // Playback Engine
  function play() {
    synth.ensureContext();
    if (state.isPlaying) return;
    state.isPlaying = true;
    currentStep = 0;
    currentBarIndex = 0;
    nextStepTime = synth.ctx.currentTime + 0.05;

    playBtn.classList.add('active');
    stopBtn.classList.remove('active');

    tick();
  }

  function stop() {
    state.isPlaying = false;
    clearTimeout(timer);
    playBtn.classList.remove('active');
    stopBtn.classList.add('active');
    setTimeout(() => stopBtn.classList.remove('active'), 250);

    highlightBar(-1);
  }

  function tick() {
    if (!state.isPlaying) return;
    while (nextStepTime < synth.ctx.currentTime + 0.1) {
      trigger(currentStep, nextStepTime);
      advance();
    }
    timer = setTimeout(tick, 25);
  }

  function advance() {
    const secPerBeat = 60.0 / state.bpm;
    const stepDuration = secPerBeat / 2.0; // 8th note steps

    nextStepTime += stepDuration;

    // Flash metronome on beats 0, 2, 4, 6 (quarter notes)
    if (currentStep % 2 === 0) {
      const beat = Math.floor(currentStep / 2);
      flashMetronome(beat);
    }

    currentStep++;
    if (currentStep >= 8) {
      currentStep = 0;
      currentBarIndex = (currentBarIndex + 1) % state.bars.length;
    }
  }

  function trigger(step, time) {
    // Trigger Track 1 Drum Loop hits
    PADS.forEach((pad) => {
      if (state.drumHits[pad.id][step]) {
        playInstrument(pad.type, time, 0.9);
        flashPad(pad.id);
      }
    });

    const delay = Math.max(0, (time - synth.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (state.isPlaying) {
        highlightBar(currentBarIndex);
      }
    }, delay);
  }

  function highlightBar(barIdx) {
    document.querySelectorAll('.bar-pill').forEach((el, idx) => {
      el.classList.toggle('active-playing', idx === barIdx);
    });
  }

  function flashPad(padId) {
    const pad = document.querySelector(`.mpc-pad[data-pad="${padId}"]`);
    if (pad) {
      pad.classList.add('lit');
      setTimeout(() => pad.classList.remove('lit'), 110);
    }
  }

  // 1. Render Single Horizontal Arranger Bar
  function renderArranger() {
    barsTimeline.innerHTML = '';
    state.bars.forEach((bar, idx) => {
      const pill = document.createElement('div');
      pill.className = `bar-pill bar-p-${bar.colorIdx % 6}`;
      pill.draggable = true;
      pill.dataset.index = idx;
      pill.textContent = bar.name;

      setupDrag(pill);
      barsTimeline.appendChild(pill);
    });
  }

  let draggedIdx = null;
  function setupDrag(pill) {
    pill.addEventListener('dragstart', () => {
      draggedIdx = parseInt(pill.dataset.index, 10);
      pill.classList.add('dragging');
    });

    pill.addEventListener('dragend', () => {
      pill.classList.remove('dragging');
      document.querySelectorAll('.bar-pill').forEach(p => p.classList.remove('drag-over'));
      draggedIdx = null;
    });

    pill.addEventListener('dragover', (e) => {
      e.preventDefault();
      pill.classList.add('drag-over');
    });

    pill.addEventListener('dragleave', () => {
      pill.classList.remove('drag-over');
    });

    pill.addEventListener('drop', (e) => {
      e.preventDefault();
      pill.classList.remove('drag-over');
      const targetIdx = parseInt(pill.dataset.index, 10);
      if (draggedIdx !== null && draggedIdx !== targetIdx) {
        const item = state.bars.splice(draggedIdx, 1)[0];
        state.bars.splice(targetIdx, 0, item);
        renderArranger();
      }
    });
  }

  // 2. Render 8 Audio Tracks
  function renderTracks() {
    tracksList.innerHTML = '';
    TRACKS.forEach((trk) => {
      const row = document.createElement('div');
      row.className = 'track-row';

      const idBadge = document.createElement('div');
      idBadge.className = 'track-id-badge';
      idBadge.textContent = trk.num;

      const nameBox = document.createElement('div');
      nameBox.className = 'track-name-box';
      nameBox.innerHTML = `
        <span class="track-name-text">${trk.name}</span>
        <span class="track-tag-text">${trk.tag}</span>
      `;

      const waveBox = document.createElement('div');
      waveBox.className = 'track-waveform-box';
      const canvas = document.createElement('canvas');
      canvas.className = 'waveform-canvas';
      canvas.width = 160;
      canvas.height = 20;
      drawWaveform(canvas, trk.color, trk.num);
      waveBox.appendChild(canvas);

      const armBtn = document.createElement('button');
      armBtn.className = `btn-arm ${state.armedTrack === trk.num ? 'armed' : ''}`;
      armBtn.title = 'Record Arm';
      armBtn.innerHTML = '<span class="arm-dot"></span>';
      armBtn.onclick = () => {
        state.armedTrack = (state.armedTrack === trk.num) ? null : trk.num;
        renderTracks();
      };

      row.appendChild(idBadge);
      row.appendChild(nameBox);
      row.appendChild(waveBox);
      row.appendChild(armBtn);
      tracksList.appendChild(row);
    });
  }

  function drawWaveform(canvas, color, seed) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    const bars = 30;
    const barW = w / bars;
    for (let i = 0; i < bars; i++) {
      const amp = Math.sin(i * 0.45 + seed) * Math.cos(i * 0.2) * 0.7 + 0.3;
      const barH = Math.max(3, amp * (h - 4));
      const y = (h - barH) / 2;
      ctx.fillRect(i * barW, y, barW - 1, barH);
    }
  }

  // 3. Render 16 Drum Pads & Erase Logic
  function renderPads() {
    padsGrid.innerHTML = '';
    PADS.forEach((pad) => {
      const padEl = document.createElement('div');
      padEl.className = 'mpc-pad';
      padEl.dataset.pad = pad.id;

      padEl.innerHTML = `
        <div class="pad-led"></div>
        <div class="pad-label">${pad.label}</div>
      `;

      const handlePress = (e) => {
        if (e) e.preventDefault();
        synth.ensureContext();

        if (state.isRecording) {
          // ERASE MODE ACTIVE!
          // Erase all hits of this pad from the Track 1 drum loop!
          state.drumHits[pad.id].fill(false);
          padEl.classList.add('erased');
          setTimeout(() => padEl.classList.remove('erased'), 200);
        } else {
          // NORMAL PLAY / OVERDUB
          playInstrument(pad.type, null, 1.0);
          padEl.classList.add('pressed');
          setTimeout(() => padEl.classList.remove('pressed'), 100);

          // If playback is running, overdub onto current step!
          if (state.isPlaying) {
            state.drumHits[pad.id][currentStep] = true;
          }
        }
      };

      padEl.addEventListener('mousedown', handlePress);
      padEl.addEventListener('touchstart', handlePress, { passive: false });

      padsGrid.appendChild(padEl);
    });
  }

  function setupEvents() {
    playBtn.onclick = () => {
      if (state.isPlaying) stop();
      else play();
    };

    stopBtn.onclick = () => stop();

    // Rec / Erase Button Toggle
    recEraseBtn.onclick = () => {
      state.isRecording = !state.isRecording;
      recEraseBtn.classList.toggle('erase-mode', state.isRecording);

      if (state.isRecording) {
        recLabel.textContent = 'ERASE';
        eraseHint.textContent = 'ERASEモード中: パッドを叩くとその音色を消去';
        eraseHint.style.color = '#f77f00';
        if (!state.isPlaying) play(); // start loop to overdub/erase live
      } else {
        recLabel.textContent = 'REC';
        eraseHint.textContent = '録音中: ERASEボタンで消去';
        eraseHint.style.color = '#777';
      }
    };

    bpmInput.onchange = () => {
      const val = parseInt(bpmInput.value, 10);
      if (!isNaN(val) && val >= 50 && val <= 220) {
        state.bpm = val;
      } else {
        bpmInput.value = state.bpm;
      }
    };

    document.getElementById('btn-add-bar').onclick = () => {
      const count = state.bars.length + 1;
      state.bars.push({
        id: 'b' + Date.now(),
        name: `Bar ${count}`,
        colorIdx: count - 1
      });
      renderArranger();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
