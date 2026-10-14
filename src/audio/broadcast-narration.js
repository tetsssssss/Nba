// Narração opt-in, usando síntese de voz local do navegador. Sem chamadas de rede ou IA remota.
export function createBroadcastNarrator({ synth = globalThis.speechSynthesis,
  Voice = globalThis.SpeechSynthesisUtterance } = {}) {
  let enabled = false;
  return {
    get available() { return Boolean(synth && Voice && typeof synth.speak === 'function'); },
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = Boolean(value && synth && Voice && typeof synth.speak === 'function');
      if (!enabled) try { synth?.cancel(); } catch { /* browser may disallow */ }
      return enabled;
    },
    announce(cue, { speed = 1 } = {}) {
      if (!enabled || !cue || speed > 2 || synth.speaking) return false;
      // Evita narrar cada posse: somente lances marcantes e interrupções registradas.
      if (!(['timeout', 'period', 'block', 'steal'].includes(cue.type) || (cue.type === 'shot' && cue.major))) return false;
      const text = [cue.teamName, cue.text].filter(Boolean).join('. ').slice(0, 260);
      if (!text) return false;
      try {
        const utter = new Voice(text);
        utter.lang = 'pt-BR'; utter.rate = 1.03; utter.pitch = 1; utter.volume = 0.82;
        synth.speak(utter);
        return true;
      } catch { return false; }
    },
    dispose() { enabled = false; try { synth?.cancel(); } catch {} },
  };
}
