/**
 * Aurora — single source of truth for moods, scoring, visuals & soundtrack seeds.
 */
(function () {
  function lerpHex(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return '#' + [r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function expandPalette(c1, c2, c3) {
    return [c1, c2, c3, lerpHex(c2, c3, 0.5), lerpHex(c1, c2, 0.35)];
  }

  function paletteGlow(colors) {
    return `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`;
  }

  const LIBRARY_MOODS = [
    'dreamy',
    'electric',
    'cozy',
    'calm',
    'bold',
    'memory_lane',
    'midnight',
    'locked_in',
  ];

  /** Weighted scoring — never 1 song → 1 mood */
  const SCORE_WEIGHTS = {
    valence: 0.4,
    energy: 0.25,
    acousticness: 0.2,
    tempo: 0.15,
  };

  const MOODS = {
    dreamy: {
      label: 'Dreamy',
      descriptor: 'Floating through pastel memories.',
      atmosphere: 'soft flow • gentle light • dreamy',
      palette: ['#E8D4F8', '#CFE9FF', '#F5C8F6'],
      colors: expandPalette('#E8D4F8', '#CFE9FF', '#F5C8F6'),
      glow: paletteGlow(['#E8D4F8', '#CFE9FF']),
      speed: 22,
      intensity: 38,
      distortion: 28,
      mouse: 0,
      targets: { energy: 0.38, valence: 0.72, tempo: 92, acousticness: 0.55 },
      constraints: { valenceMin: 0.55, energyMax: 0.55, acousticnessMin: 0.35 },
      soundtrack: {
        genres: ['dream-pop', 'indie', 'ambient'],
        searches: ['dream pop ethereal', 'indie ambient floating', 'soft dream pop playlist'],
        target_energy: 0.38,
        target_valence: 0.72,
        target_tempo: 92,
      },
    },
    electric: {
      label: 'Electric',
      descriptor: 'Buzzing with ideas. High energy and vibrant.',
      atmosphere: 'fast motion • high intensity • electric',
      palette: ['#00D4FF', '#7A5FFF', '#4B7BFF'],
      colors: expandPalette('#00D4FF', '#7A5FFF', '#4B7BFF'),
      glow: paletteGlow(['#00D4FF', '#7A5FFF']),
      speed: 48,
      intensity: 62,
      distortion: 58,
      mouse: 0,
      targets: { energy: 0.88, valence: 0.72, tempo: 132, acousticness: 0.1 },
      constraints: { energyMin: 0.75, tempoMin: 118, danceabilityMin: 0.65 },
      soundtrack: {
        genres: ['edm', 'hyperpop', 'dance'],
        searches: ['electric dance hyperpop', 'high energy edm', 'neon club playlist'],
        target_energy: 0.88,
        target_valence: 0.72,
        target_tempo: 132,
      },
    },
    cozy: {
      label: 'Cozy',
      descriptor: 'Safe, warm, and wrapped in comfort.',
      atmosphere: 'low movement • warm tones • cozy',
      palette: ['#FFD4B0', '#FFF0E0', '#E8C9A8'],
      colors: expandPalette('#FFD4B0', '#FFF0E0', '#E8C9A8'),
      glow: paletteGlow(['#FFD4B0', '#FFF0E0']),
      speed: 16,
      intensity: 26,
      distortion: 18,
      mouse: 0,
      targets: { energy: 0.35, valence: 0.68, tempo: 98, acousticness: 0.62 },
      constraints: { acousticnessMin: 0.45, tempoMax: 115, valenceMin: 0.5 },
      soundtrack: {
        genres: ['acoustic', 'lo-fi', 'indie-pop'],
        searches: ['cozy acoustic lofi', 'bedroom pop warm', 'soft coffee morning playlist'],
        target_energy: 0.35,
        target_valence: 0.68,
        target_tempo: 98,
      },
    },
    calm: {
      label: 'Calm',
      descriptor: 'Focused, clear, and unhurried.',
      atmosphere: 'very subtle • cool light • calm',
      palette: ['#DDE6F2', '#C8D0DC', '#F4F7FA'],
      colors: expandPalette('#DDE6F2', '#C8D0DC', '#F4F7FA'),
      glow: paletteGlow(['#DDE6F2', '#C8D0DC']),
      speed: 12,
      intensity: 18,
      distortion: 12,
      mouse: 0,
      targets: { energy: 0.22, valence: 0.52, tempo: 78, acousticness: 0.72 },
      constraints: { energyMax: 0.35, acousticnessMin: 0.55, tempoMax: 100 },
      soundtrack: {
        genres: ['ambient', 'classical', 'piano'],
        searches: ['calm instrumental minimal', 'peaceful ambient piano', 'focus instrumental playlist'],
        target_energy: 0.22,
        target_valence: 0.52,
        target_tempo: 78,
      },
    },
    bold: {
      label: 'Bold',
      descriptor: 'Confident, dramatic, and unapologetic.',
      atmosphere: 'strong contrast • vivid • bold',
      palette: ['#FF5AC8', '#E8344A', '#7A2FD4'],
      colors: expandPalette('#FF5AC8', '#E8344A', '#7A2FD4'),
      glow: paletteGlow(['#FF5AC8', '#E8344A']),
      speed: 40,
      intensity: 55,
      distortion: 46,
      mouse: 0,
      targets: { energy: 0.78, valence: 0.58, tempo: 118, acousticness: 0.18 },
      constraints: { energyMin: 0.65, danceabilityMin: 0.55 },
      soundtrack: {
        genres: ['pop', 'rock', 'hip-hop'],
        searches: ['bold pop anthem', 'confident pop hits', 'dramatic anthem playlist'],
        target_energy: 0.78,
        target_valence: 0.58,
        target_tempo: 118,
      },
    },
    memory_lane: {
      label: 'Memory Lane',
      descriptor: 'Nostalgic — like old photos and childhood.',
      atmosphere: 'slow drift • film grain • memory lane',
      palette: ['#D4B896', '#C9A0A0', '#E8DFC8'],
      colors: expandPalette('#D4B896', '#C9A0A0', '#E8DFC8'),
      glow: paletteGlow(['#D4B896', '#C9A0A0']),
      speed: 18,
      intensity: 30,
      distortion: 22,
      mouse: 0,
      targets: { energy: 0.42, valence: 0.55, tempo: 95, acousticness: 0.58 },
      constraints: { valenceMin: 0.4, valenceMax: 0.72, acousticnessMin: 0.35 },
      soundtrack: {
        genres: ['soft-rock', 'indie', 'synth-pop'],
        searches: ['90s nostalgic soft rock', 'retro memories playlist', 'childhood throwback indie'],
        target_energy: 0.42,
        target_valence: 0.55,
        target_tempo: 95,
      },
    },
    midnight: {
      label: 'Midnight',
      descriptor: 'Late night drives and introspection.',
      atmosphere: 'deep gradients • slow breathing • midnight',
      palette: ['#1A2744', '#2D3A5C', '#B8C4D8'],
      colors: expandPalette('#1A2744', '#2D3A5C', '#B8C4D8'),
      glow: paletteGlow(['#2D3A5C', '#B8C4D8']),
      speed: 14,
      intensity: 24,
      distortion: 16,
      mouse: 0,
      targets: { energy: 0.28, valence: 0.35, tempo: 82, acousticness: 0.45 },
      constraints: { energyMax: 0.45, valenceMax: 0.55, tempoMax: 105 },
      soundtrack: {
        genres: ['dark-ambient', 'synthwave', 'trip-hop'],
        searches: ['midnight dark ambient', 'late night drive synth', 'night introspective playlist'],
        target_energy: 0.28,
        target_valence: 0.35,
        target_tempo: 82,
      },
    },
    locked_in: {
      label: 'Locked In',
      descriptor: 'Deep work. Focus mode engaged.',
      atmosphere: 'minimal • precise • locked in',
      palette: ['#3A3F4A', '#4A90D9', '#E8ECF2'],
      colors: expandPalette('#3A3F4A', '#4A90D9', '#E8ECF2'),
      glow: paletteGlow(['#3A3F4A', '#4A90D9']),
      speed: 10,
      intensity: 20,
      distortion: 10,
      mouse: 0,
      targets: { energy: 0.55, valence: 0.45, tempo: 105, acousticness: 0.25 },
      constraints: { energyMin: 0.4, energyMax: 0.7, danceabilityMin: 0.45 },
      soundtrack: {
        genres: ['electronic', 'phonk', 'instrumental'],
        searches: ['deep focus phonk', 'locked in electronic instrumental', 'work mode beats'],
        target_energy: 0.55,
        target_valence: 0.45,
        target_tempo: 105,
      },
    },
  };

  const MOOD_ALIASES = {
    mellow: 'calm',
    memory: 'memory_lane',
    nostalgic: 'memory_lane',
    focus: 'locked_in',
  };

  function toLibraryMood(moodId) {
    if (!moodId) return 'dreamy';
    const id = String(moodId).toLowerCase().replace(/\s+/g, '_');
    if (LIBRARY_MOODS.includes(id)) return id;
    if (MOOD_ALIASES[id]) return MOOD_ALIASES[id];
    return 'dreamy';
  }

  window.AuroraMoods = {
    LIBRARY_MOODS,
    MOODS,
    SCORE_WEIGHTS,
    toLibraryMood,
    expandPalette,
    paletteGlow,
  };
})();
