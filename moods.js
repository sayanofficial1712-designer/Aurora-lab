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
    'mellow',
    'bold',
    'memory_lane',
    'midnight',
    'indie',
    'bollywood',
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
      descriptor: 'Light as a feather — soft pink and warm white.',
      atmosphere: 'barely there • blush & white • cozy',
      palette: ['#FFFEFE', '#FFE8F2', '#FFD6E8'],
      colors: expandPalette('#FFFEFE', '#FFE8F2', '#FFD6E8'),
      glow: paletteGlow(['#FFFEFE', '#FFE8F2']),
      speed: 14,
      intensity: 22,
      distortion: 14,
      mouse: 0,
      targets: { energy: 0.32, valence: 0.72, tempo: 96, acousticness: 0.58 },
      constraints: { acousticnessMin: 0.4, tempoMax: 112, valenceMin: 0.55 },
      soundtrack: {
        genres: ['acoustic', 'lo-fi', 'indie-pop'],
        searches: ['cozy acoustic lofi', 'soft pink morning playlist', 'light feather acoustic'],
        target_energy: 0.32,
        target_valence: 0.72,
        target_tempo: 96,
      },
    },
    mellow: {
      label: 'Mellow',
      descriptor: 'Quiet, unhurried, and softly grounded.',
      atmosphere: 'very subtle • cool light • mellow',
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
        searches: ['mellow instrumental minimal', 'peaceful ambient piano', 'soft unhurried playlist'],
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
      descriptor: 'Late night drives and deep blue introspection.',
      atmosphere: 'deep blue gradients • slow breathing • midnight',
      palette: ['#0A1628', '#1B3A6B', '#2563A8'],
      colors: expandPalette('#0A1628', '#1B3A6B', '#2563A8'),
      glow: paletteGlow(['#1B3A6B', '#2563A8']),
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
    indie: {
      label: 'Indie',
      descriptor: 'Raw, honest, and off the beaten path.',
      atmosphere: 'organic drift • forest green • indie',
      palette: ['#1B4332', '#40916C', '#95D5B2'],
      colors: expandPalette('#1B4332', '#40916C', '#95D5B2'),
      glow: paletteGlow(['#40916C', '#95D5B2']),
      speed: 26,
      intensity: 36,
      distortion: 30,
      mouse: 0,
      targets: { energy: 0.48, valence: 0.58, tempo: 102, acousticness: 0.52 },
      constraints: { acousticnessMin: 0.3, energyMin: 0.3, energyMax: 0.65 },
      soundtrack: {
        genres: ['indie', 'alternative', 'indie-rock'],
        searches: ['indie alternative playlist', 'indian indie rock', 'bedroom indie gems'],
        target_energy: 0.48,
        target_valence: 0.58,
        target_tempo: 102,
      },
    },
    bollywood: {
      label: 'Bollywood',
      descriptor: 'Colour, drama, and full-hearted celebration.',
      atmosphere: 'warm pulse • saffron & magenta • bollywood',
      palette: ['#FF6F61', '#FFB347', '#E848AB'],
      colors: expandPalette('#FF6F61', '#FFB347', '#E848AB'),
      glow: paletteGlow(['#FF6F61', '#E848AB']),
      speed: 34,
      intensity: 50,
      distortion: 38,
      mouse: 0,
      targets: { energy: 0.72, valence: 0.78, tempo: 112, acousticness: 0.28 },
      constraints: { energyMin: 0.55, valenceMin: 0.55, danceabilityMin: 0.5 },
      soundtrack: {
        genres: ['bollywood', 'desi', 'filmi'],
        searches: ['bollywood hits playlist', 'hindi film songs', 'desi dance party'],
        target_energy: 0.72,
        target_valence: 0.78,
        target_tempo: 112,
      },
    },
  };

  const MOOD_ALIASES = {
    calm: 'mellow',
    memory: 'memory_lane',
    nostalgic: 'memory_lane',
    focus: 'mellow',
    locked_in: 'indie',
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
