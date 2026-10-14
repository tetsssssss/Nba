// Sonoplastia 1.0: efeitos gerados localmente por Web Audio, sem arquivos externos.
// O módulo não acessa o estado da carreira nem altera o motor de partidas.
import { getSetting } from '../core/settings.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
export const SOUND_KINDS = Object.freeze(['bounce', 'shoe', 'rim', 'swish', 'whistle', 'buzzer', 'steal', 'crowd', 'dunk', 'pass']);

/** Classificação tolerante a descrições de lance em português, sem mutar o evento. */
export function classifyBasketballEvent(event) {
  if (!event || typeof event.text !== 'string') return null;
  const msg = event.text.toLocaleLowerCase('pt-BR');
  if (/fim do (\d+º quarto|tempo extra)|estouro dos 24 segundos/.test(msg)) return 'buzzer';
  if (/falta|andada|pisa na linha|bola fora/.test(msg)) return 'whistle';
  if (/rouba a bola|dá um toco|tira a bola/.test(msg)) return 'steal';
  if (/converte .*enterrada/.test(msg)) return 'dunk';
  if (/converte (o )?lance livre|converte /.test(msg)) return 'swish';
  if (/erra (o )?lance livre|erra /.test(msg)) return 'rim';
  if (/passe para|assistência para/.test(msg)) return 'pass';
  if (/tempo pedido/.test(msg)) return 'whistle';
  return null;
}

export function audioPreferences() {
  return {
    enabled: getSetting('audioEnabled') !== false,
    master: clamp(getSetting('audioMaster') ?? 0.65),
    court: clamp(getSetting('audioCourt') ?? 0.8),
    arena: clamp(getSetting('audioArena') ?? 0.45),
  };
}

// Injetável para testes. Nenhum AudioContext é instanciado na importação.
export function createSoundscape({ contextFactory, preferences = audioPreferences, timestamp = () => Date.now() } = {}) {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let active = false;
  let lastPlayed = new Map();
  let lastBounce = -Infinity;
  let played = 0;
  const cooldown = { bounce: 135, shoe: 240, rim: 180, swish: 180, whistle: 400, buzzer: 700, steal: 180, crowd: 400, dunk: 250, pass: 220 };
  const create = contextFactory ?? (() => {
    const Type = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return Type ? new Type() : null;
  });
  const canPlay = () => !!context && context.state === 'running' && preferences().enabled && preferences().master > 0;
  const volumeFor = (kind) => clamp(preferences()[kind === 'crowd' ? 'arena' : 'court']);

  function applyVolume() {
    if (!master || !context) return;
    master.gain.setTargetAtTime(clamp(preferences().master), context.currentTime, 0.025);
  }
  async function unlock() {
    if (!preferences().enabled) return false;
    try {
      if (!context) {
        context = create();
        if (!context) return false;
        master = context.createGain();
        master.gain.value = 0;
        master.connect(context.destination);
      }
      if (context.state !== 'running') await context.resume();
      applyVolume();
      return context.state === 'running';
    } catch { return false; }
  }

  function envelope(duration, gain, t) {
    const node = context.createGain();
    node.gain.setValueAtTime(0.001, t);
    node.gain.linearRampToValueAtTime(Math.max(0.001, gain), t + 0.012);
    node.gain.exponentialRampToValueAtTime(0.001, t + duration);
    node.connect(master);
    return node;
  }
  function oscillator(type, freq, endFreq, duration, level, t, delay = 0) {
    const start = t + delay;
    const src = context.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) src.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
    src.connect(envelope(duration + 0.005, level, start));
    src.start(start);
    src.stop(start + duration + 0.01);
  }
  function noise(duration, gain, t, cutoff = 2200) {
    const sampleRate = context.sampleRate || 44100;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, Math.ceil(sampleRate * 0.5), sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 77623;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        data[i] = ((seed >>> 1) / 1073741824 - 1) * 0.7;
      }
    }
    const src = context.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    src.connect(filter);
    filter.connect(envelope(duration, gain, t));
    src.start(t);
    src.stop(t + Math.min(duration + 0.01, 0.49));
  }

  function play(kind, { intensity = 1 } = {}) {
    if (!SOUND_KINDS.includes(kind) || !active || !canPlay()) return false;
    const at = timestamp();
    if (at - (lastPlayed.get(kind) ?? -Infinity) < cooldown[kind]) return false;
    applyVolume();
    const t = context.currentTime + 0.006;
    const v = clamp(intensity) * volumeFor(kind);
    if (v === 0) return false;
    lastPlayed.set(kind, at);
    if (kind === 'bounce') {
      oscillator('sine', 145, 67, 0.14, 0.24 * v, t);
      noise(0.055, 0.06 * v, t, 750);
    } else if (kind === 'shoe') {
      noise(0.095, 0.12 * v, t, 2800);
      oscillator('triangle', 1100, 570, 0.078, 0.018 * v, t);
    } else if (kind === 'rim') {
      oscillator('triangle', 780, 720, 0.23, 0.11 * v, t);
      oscillator('sine', 1130, 1040, 0.29, 0.065 * v, t, 0.014);
    } else if (kind === 'swish') {
      noise(0.23, 0.19 * v, t, 6800);
      oscillator('sine', 360, 250, 0.17, 0.035 * v, t);
    } else if (kind === 'dunk') {
      oscillator('triangle', 220, 72, 0.26, 0.27 * v, t);
      oscillator('sine', 910, 680, 0.17, 0.1 * v, t);
      noise(0.22, 0.10 * v, t, 4000);
    } else if (kind === 'whistle') {
      oscillator('sine', 2550, 2640, 0.29, 0.11 * v, t);
      oscillator('sine', 2690, 2530, 0.27, 0.06 * v, t);
    } else if (kind === 'buzzer') {
      oscillator('sawtooth', 205, 203, 0.42, 0.11 * v, t);
      oscillator('square', 102, 102, 0.42, 0.048 * v, t);
    } else if (kind === 'steal') {
      noise(0.09, 0.12 * v, t, 1500);
      oscillator('sine', 370, 190, 0.13, 0.07 * v, t);
    } else if (kind === 'pass') {
      oscillator('sine', 290, 180, 0.08, 0.09 * v, t);
    } else if (kind === 'crowd') {
      noise(0.46, 0.17 * v, t, 1300);
      oscillator('triangle', 95, 120, 0.31, 0.016 * v, t);
    }
    played++;
    return true;
  }

  function playBasketballEvent(event, { speed = 1 } = {}) {
    if (speed > 4) return false;
    const kind = classifyBasketballEvent(event);
    if (!kind) return false;
    const result = play(kind);
    if (result && ['swish', 'dunk'].includes(kind) && event?.major) play('crowd', { intensity: kind === 'dunk' ? 1 : 0.6 });
    return result;
  }
  function courtTick({ ballHeld = false, moving = false, speed = 1 } = {}) {
    if (speed > 2 || !active || !canPlay()) return false;
    const now = timestamp();
    if (now - lastBounce < 750) return false;
    if (ballHeld) { lastBounce = now; return play('bounce', { intensity: 0.5 }); }
    if (moving) { lastBounce = now; return play('shoe', { intensity: 0.4 }); }
    return false;
  }
  function setActive(value) { active = !!value; if (!active) lastBounce = -Infinity; }
  function dispose() { active = false; lastPlayed.clear(); if (context) { try { void context.close(); } catch {} } context = master = noiseBuffer = null; }
  return { unlock, play, playBasketballEvent, courtTick, setActive, applyVolume, dispose, isUnlocked: () => !!context && context.state === 'running', get played() { return played; } };
}

export const gameSound = createSoundscape();
