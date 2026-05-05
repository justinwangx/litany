const AudioContextClass = window.AudioContext || window.webkitAudioContext;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function textFadeEnvelope(elapsed) {
  const linePhase = (elapsed % 5) / 5;
  const fadeIn = smoothstep(0.02, 0.2, linePhase);
  const fadeOut = 1 - smoothstep(0.66, 0.98, linePhase);
  return 0.62 + Math.min(fadeIn, fadeOut) * 0.38;
}

function setTarget(param, value, time, constant = 0.12) {
  param.setTargetAtTime(value, time, constant);
}

function createPan(context, value = 0) {
  if (context.createStereoPanner) {
    const pan = context.createStereoPanner();
    pan.pan.value = value;
    return pan;
  }
  return context.createGain();
}

function setPan(node, value, time) {
  if (node.pan) setTarget(node.pan, value, time, 0.18);
}

function createNoiseBuffer(context, seconds = 3, lowMix = 0.2) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      low = low * 0.985 + white * 0.015;
      data[i] = white * (1 - lowMix) + low * lowMix * 5.5;
    }
  }

  return buffer;
}

function createClickBuffer(context) {
  const length = Math.floor(context.sampleRate * 0.045);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const x = i / length;
    const envelope = Math.pow(1 - x, 7);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  return buffer;
}

export function createLitanyAudio() {
  let context;
  let master;
  let windGain;
  let windLow;
  let windHigh;
  let windPan;
  let hissGain;
  let hissLow;
  let hissHigh;
  let hissPan;
  let rumbleOsc;
  let rumbleGain;
  let toneA;
  let toneB;
  let toneGain;
  let toneFilter;
  let clickBuffer;
  let clickBus;
  let ready = false;
  let nextClickAt = 0;

  function init() {
    if (ready) return true;
    if (!AudioContextClass) return false;

    context = new AudioContextClass({ latencyHint: "interactive" });

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.018;
    compressor.release.value = 0.34;

    master = context.createGain();
    master.gain.value = 0;
    master.connect(compressor);
    compressor.connect(context.destination);

    const wind = context.createBufferSource();
    wind.buffer = createNoiseBuffer(context, 4, 0.34);
    wind.loop = true;
    windHigh = context.createBiquadFilter();
    windHigh.type = "highpass";
    windHigh.frequency.value = 72;
    windLow = context.createBiquadFilter();
    windLow.type = "lowpass";
    windLow.frequency.value = 5200;
    windLow.Q.value = 0.28;
    windPan = createPan(context);
    windGain = context.createGain();
    windGain.gain.value = 0;
    wind.connect(windHigh);
    windHigh.connect(windLow);
    windLow.connect(windPan);
    windPan.connect(windGain);
    windGain.connect(master);
    wind.start();

    const hiss = context.createBufferSource();
    hiss.buffer = createNoiseBuffer(context, 2, 0.04);
    hiss.loop = true;
    hissHigh = context.createBiquadFilter();
    hissHigh.type = "highpass";
    hissHigh.frequency.value = 1400;
    hissLow = context.createBiquadFilter();
    hissLow.type = "lowpass";
    hissLow.frequency.value = 9800;
    hissPan = createPan(context);
    hissGain = context.createGain();
    hissGain.gain.value = 0;
    hiss.connect(hissHigh);
    hissHigh.connect(hissLow);
    hissLow.connect(hissPan);
    hissPan.connect(hissGain);
    hissGain.connect(master);
    hiss.start();

    rumbleOsc = context.createOscillator();
    rumbleOsc.type = "sine";
    rumbleOsc.frequency.value = 38;
    rumbleGain = context.createGain();
    rumbleGain.gain.value = 0;
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(master);
    rumbleOsc.start();

    toneA = context.createOscillator();
    toneA.type = "sine";
    toneA.frequency.value = 164.81;
    toneB = context.createOscillator();
    toneB.type = "triangle";
    toneB.frequency.value = 247.94;
    toneFilter = context.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 930;
    toneFilter.Q.value = 0.55;
    toneGain = context.createGain();
    toneGain.gain.value = 0;
    toneA.connect(toneFilter);
    toneB.connect(toneFilter);
    toneFilter.connect(toneGain);
    toneGain.connect(master);
    toneA.start();
    toneB.start();

    clickBuffer = createClickBuffer(context);
    clickBus = context.createGain();
    clickBus.gain.value = 0.62;
    clickBus.connect(master);
    nextClickAt = context.currentTime + 0.05;
    ready = true;
    return true;
  }

  function scheduleClick(when, energy) {
    const source = context.createBufferSource();
    source.buffer = clickBuffer;
    source.playbackRate.value = randomBetween(0.65, 2.4);

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = randomBetween(1600, 7600);
    filter.Q.value = randomBetween(2.4, 9.5);

    const pan = createPan(context, randomBetween(-0.96, 0.96));
    const gain = context.createGain();
    const peak = randomBetween(0.003, 0.018) * Math.pow(energy, 0.9);
    const decay = randomBetween(0.014, 0.052);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    source.connect(filter);
    filter.connect(pan);
    pan.connect(gain);
    gain.connect(clickBus);
    source.start(when);
    source.stop(when + decay + 0.02);
  }

  function scheduleSand(progress, energy) {
    if (!ready || context.state !== "running") return;
    const now = context.currentTime;
    if (energy < 0.035 || progress > 0.93) {
      nextClickAt = now + 0.05;
      return;
    }

    const horizon = now + 0.09;
    const rate = 1.5 + 20 * Math.pow(energy, 1.65);
    if (nextClickAt < now) nextClickAt = now + randomBetween(0.005, 0.04);

    while (nextClickAt < horizon) {
      scheduleClick(nextClickAt, energy);
      nextClickAt += randomBetween(0.018, 0.22) / rate * 18;
    }
  }

  async function start() {
    if (!init()) return false;
    if (context.state === "running") return true;

    try {
      await context.resume();
    } catch {
      return false;
    }

    return context.state === "running";
  }

  function update({ progress, calm, elapsed, motionTime, pointer }) {
    if (!ready) return;

    const now = context.currentTime;
    const chaos = 1 - calm;
    const textFade = textFadeEnvelope(elapsed);
    const mellow = 1 - smoothstep(0.18, 0.76, progress);
    const finalFade = 1 - smoothstep(0.82, 1, progress);
    const stormEnergy = Math.pow(chaos, 0.82) * (0.24 + 0.76 * mellow) * finalFade;
    const abrasive = Math.pow(chaos, 1.35) * Math.pow(mellow, 1.65) * textFade * finalFade;
    const windBody = stormEnergy * (0.72 + textFade * 0.28);
    const harmonic = smoothstep(0.34, 0.76, progress) * (1 - smoothstep(0.86, 1, progress));
    const sway = Math.sin(motionTime * 0.72) * 0.32 * stormEnergy + (pointer.x - 0.5) * 0.18 * stormEnergy;

    setTarget(master.gain, 0.37 * finalFade * (0.7 + textFade * 0.3), now, 0.28);
    setTarget(windGain.gain, 0.25 * windBody + 0.008 * finalFade, now, 0.2);
    setTarget(hissGain.gain, 0.07 * abrasive, now, 0.1);
    setTarget(rumbleGain.gain, 0.064 * Math.pow(stormEnergy, 1.15), now, 0.28);
    setTarget(toneGain.gain, 0.034 * harmonic, now, 0.38);

    setTarget(windLow.frequency, 580 + 4800 * Math.pow(stormEnergy, 1.08), now, 0.24);
    setTarget(windHigh.frequency, 72 + 520 * (1 - mellow), now, 0.28);
    setTarget(hissLow.frequency, 1400 + 7400 * abrasive, now, 0.1);
    setTarget(hissHigh.frequency, 1100 + 2100 * (1 - mellow), now, 0.16);
    setTarget(rumbleOsc.frequency, 30 + Math.sin(motionTime * 0.9) * 4 * stormEnergy, now, 0.35);
    setTarget(toneFilter.frequency, 520 + 420 * harmonic, now, 0.4);
    setTarget(toneA.frequency, 164.81 + Math.sin(motionTime * 0.21) * 0.45, now, 0.5);
    setTarget(toneB.frequency, 247.94 + Math.cos(motionTime * 0.17) * 0.62, now, 0.5);

    setPan(windPan, sway, now);
    setPan(hissPan, -sway * 0.72 + Math.sin(motionTime * 1.9) * 0.12 * stormEnergy, now);
    scheduleSand(progress, abrasive);
  }

  function restart() {
    if (!ready) return;
    nextClickAt = context.currentTime + 0.02;
    setTarget(master.gain, 0, context.currentTime, 0.04);
  }

  function state() {
    return ready && context ? context.state : "unavailable";
  }

  return { restart, start, state, update };
}
