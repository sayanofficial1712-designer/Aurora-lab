// ─────────────────────────────────────────────────────────────
// STEP 1: Paste your Spotify Client ID here after creating an
// app at https://developer.spotify.com/dashboard
// Add http://localhost:3000 (and your deployed URL) as a
// Redirect URI in your Spotify app settings.
// ─────────────────────────────────────────────────────────────
const SPOTIFY_CLIENT_ID = 'a0b0a5190eff47bd92e15db39f5d37e6';
const SPOTIFY_REDIRECT_URI = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://sayanofficial1712-designer.github.io/Aurora-lab/';
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

// ─────────────────────────────────────────────────────────────
// Global state — read by aurora.js render loop
// ─────────────────────────────────────────────────────────────
window.spotifyState = {
  connected: false,
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
};

// Target values — interpolated smoothly toward current song's features
const _target = {
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
};

// Called every frame from aurora.js to smoothly lerp toward target
window.tickSpotify = function () {
  if (!window.spotifyState.connected) return;
  const s = window.spotifyState;
  const lerp = (a, b, t) => a + (b - a) * t;
  const speed = 0.05; // fast but still smooth — transitions visible in ~1s
  s.energy = lerp(s.energy, _target.energy, speed);
  s.valence = lerp(s.valence, _target.valence, speed);
  s.tempo = lerp(s.tempo, _target.tempo, speed);
  s.danceability = lerp(s.danceability, _target.danceability, speed);
};

// ─────────────────────────────────────────────────────────────
// PKCE helpers
// ─────────────────────────────────────────────────────────────
function _base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _sha256(plain) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

async function _generatePKCE() {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  const verifier = _base64urlEncode(array);
  const challenge = _base64urlEncode(await _sha256(verifier));
  return { verifier, challenge };
}

// ─────────────────────────────────────────────────────────────
// Auth flow
// ─────────────────────────────────────────────────────────────
async function _initiateAuth() {
  if (SPOTIFY_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    alert('Paste your Spotify Client ID into spotify.js first.\nCreate an app at https://developer.spotify.com/dashboard');
    return;
  }
  const { verifier, challenge } = await _generatePKCE();
  localStorage.setItem('aurora_spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function _exchangeCode(code) {
  const verifier = localStorage.getItem('aurora_spotify_verifier');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token exchange failed');
  _saveTokens(data);
  localStorage.removeItem('aurora_spotify_verifier');
  return data.access_token;
}

async function _refreshToken() {
  const refresh = localStorage.getItem('aurora_spotify_refresh');
  if (!refresh) throw new Error('No refresh token');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Refresh failed');
  _saveTokens(data);
  return data.access_token;
}

function _saveTokens(data) {
  localStorage.setItem('aurora_spotify_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('aurora_spotify_refresh', data.refresh_token);
  localStorage.setItem('aurora_spotify_expiry', Date.now() + data.expires_in * 1000);
}

async function _getToken() {
  const expiry = parseInt(localStorage.getItem('aurora_spotify_expiry') || '0');
  if (Date.now() > expiry - 60000) return _refreshToken();
  return localStorage.getItem('aurora_spotify_token');
}

// ─────────────────────────────────────────────────────────────
// Spotify API calls
// ─────────────────────────────────────────────────────────────
async function _fetchCurrentTrack(token) {
  const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 204 || resp.status === 200 && resp.headers.get('content-length') === '0') return null;
  if (!resp.ok) throw new Error(`Spotify API ${resp.status}`);
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// Spotify deprecated /audio-features for new apps (403). We use genre-based mapping only.

async function _fetchTrack(token, trackId) {
  const resp = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Track ${resp.status}`);
  return resp.json();
}

async function _fetchArtist(token, artistId) {
  const resp = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Artist ${resp.status}`);
  return resp.json();
}

// ─────────────────────────────────────────────────────────────
// Playback controls
// ─────────────────────────────────────────────────────────────
let _isPlaying = false;

async function _playPause() {
  try {
    const token = await _getToken();
    const endpoint = _isPlaying
      ? 'https://api.spotify.com/v1/me/player/pause'
      : 'https://api.spotify.com/v1/me/player/play';
    const resp = await fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok || resp.status === 204) {
      _isPlaying = !_isPlaying;
      _updatePlayPauseUI();
      // Poll immediately to catch state change
      setTimeout(_poll, 500);
    } else {
      console.warn('[Aurora × Spotify] playback control failed:', resp.status);
    }
  } catch (err) {
    console.warn('[Aurora × Spotify] playback error:', err.message);
  }
}

async function _skipNext() {
  try {
    const token = await _getToken();
    const resp = await fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok || resp.status === 204) {
      setTimeout(_poll, 500);
    }
  } catch (err) {
    console.warn('[Aurora × Spotify] skip error:', err.message);
  }
}

async function _skipPrev() {
  try {
    const token = await _getToken();
    const resp = await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok || resp.status === 204) {
      setTimeout(_poll, 500);
    }
  } catch (err) {
    console.warn('[Aurora × Spotify] skip error:', err.message);
  }
}

function _updatePlayPauseUI() {
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.classList.toggle('playing', _isPlaying);
}

// Genre → audio-feature heuristics. Widened spread so different songs feel dramatically different.
const _GENRE_PROFILES = [
  { match: /(edm|electronic|house|techno|trance|dubstep|drum.?and.?bass|dnb)/i, energy: 0.95, valence: 0.75, tempo: 140, danceability: 0.92 },
  { match: /(dance|club)/i,                                       energy: 0.9,  valence: 0.78, tempo: 128, danceability: 0.9  },
  { match: /(rock|metal|punk|grunge|hardcore)/i,                  energy: 0.88, valence: 0.5,  tempo: 135, danceability: 0.5  },
  { match: /(k-pop|j-pop|anime)/i,                                energy: 0.85, valence: 0.82, tempo: 125, danceability: 0.85 },
  { match: /(latin|reggaeton|salsa|samba|bossa|afrobeat)/i,       energy: 0.82, valence: 0.85, tempo: 105, danceability: 0.9  },
  { match: /(hip\s?hop|rap|trap|drill)/i,                         energy: 0.75, valence: 0.55, tempo: 95,  danceability: 0.82 },
  { match: /(pop)/i,                                              energy: 0.72, valence: 0.72, tempo: 118, danceability: 0.78 },
  { match: /(r&b|soul|funk|disco)/i,                              energy: 0.6,  valence: 0.72, tempo: 100, danceability: 0.82 },
  { match: /(country)/i,                                          energy: 0.55, valence: 0.62, tempo: 105, danceability: 0.55 },
  { match: /(jazz|blues|swing)/i,                                 energy: 0.4,  valence: 0.5,  tempo: 105, danceability: 0.5  },
  { match: /(folk|acoustic|singer-songwriter|indie\s*folk)/i,     energy: 0.32, valence: 0.48, tempo: 90,  danceability: 0.4  },
  { match: /(classical|orchestral|piano|baroque|opera)/i,         energy: 0.22, valence: 0.42, tempo: 80,  danceability: 0.22 },
  { match: /(ambient|chill|lofi|lo-fi|new age|downtempo|sleep)/i, energy: 0.15, valence: 0.42, tempo: 72,  danceability: 0.4  },
];

// Keyword hints in track/album titles — pushed further to extremes
const _TITLE_HINTS = [
  { match: /(sad|lonely|cry|tears|heartbreak|melanchol|grief|funeral|alone|broken|gone)/i, energy: 0.2, valence: 0.12, tempo: 70, danceability: 0.25, mood: 'mellow' },
  { match: /(chill|sleep|calm|peace|ambient|meditat|rain|soft|lullaby|gentle)/i,           energy: 0.2, valence: 0.45, tempo: 72, danceability: 0.3, mood: 'calm' },
  { match: /(party|dance|club|remix|banger|hype|fire|wild|crazy|loud)/i,                   energy: 0.95, valence: 0.85, tempo: 135, danceability: 0.95, mood: 'electric' },
  { match: /(love|happy|joy|sun|bright|smile|dream|paradise|forever)/i,                    energy: 0.7,  valence: 0.85, tempo: 115, danceability: 0.72, mood: 'cozy' },
];

// Hardcoded artist-name hints for artists whose Spotify genre tags are sparse/generic.
// Key = lowercase fragment of artist name, value = mood.
const _ARTIST_HINTS = {
  // Electric / EDM
  'avicii': 'electric', 'calvin harris': 'electric', 'martin garrix': 'electric',
  'david guetta': 'electric', 'tiësto': 'electric', 'tiesto': 'electric',
  'deadmau5': 'electric', 'zedd': 'electric', 'marshmello': 'electric',
  'daft punk': 'electric', 'swedish house mafia': 'electric',
  'skrillex': 'electric', 'diplo': 'electric', 'chainsmokers': 'electric',
  'alan walker': 'electric', 'kygo': 'electric', 'illenium': 'electric',
  // Bold
  'the weeknd': 'bold', 'dua lipa': 'bold', 'weeknd': 'bold',
  'taylor swift': 'bold', 'ariana grande': 'bold', 'beyoncé': 'bold',
  'beyonce': 'bold', 'rihanna': 'bold', 'lady gaga': 'bold',
  'billie eilish': 'bold', 'post malone': 'bold', 'drake': 'bold',
  'kendrick lamar': 'bold', 'kanye': 'bold', 'eminem': 'bold',
  'ed sheeran': 'bold', 'harry styles': 'bold', 'bruno mars': 'bold',
  'imagine dragons': 'bold', 'coldplay': 'bold', 'maroon 5': 'bold',
  'sam smith': 'bold', 'selena gomez': 'bold', 'shawn mendes': 'bold',
  'olivia rodrigo': 'bold', 'doja cat': 'bold', 'lizzo': 'bold',
  // Cozy
  'john mayer': 'cozy', 'norah jones': 'cozy', 'jack johnson': 'cozy',
  'frank sinatra': 'cozy', 'michael bublé': 'cozy', 'michael buble': 'cozy',
  'sade': 'cozy', 'amy winehouse': 'cozy', 'alicia keys': 'cozy',
  // Mellow
  'adele': 'mellow', 'lana del rey': 'mellow', 'sufjan stevens': 'mellow',
  'elliott smith': 'mellow', 'nick cave': 'mellow', 'bon iver': 'mellow',
  'phoebe bridgers': 'mellow', 'james blake': 'mellow',
  // Calm
  'brian eno': 'calm', 'max richter': 'calm', 'ólafur arnalds': 'calm',
  'olafur arnalds': 'calm', 'ludovico einaudi': 'calm', 'yiruma': 'calm',
};

function _inferMoodHint(genres, text, artistNames) {
  // 1. Title/album keyword check first
  const titleHint = _TITLE_HINTS.find((hint) => hint.match.test(text));
  if (titleHint) return titleHint.mood;

  // 2. Known artist names (most reliable since genre API is sparse)
  for (const name of (artistNames || [])) {
    const lower = name.toLowerCase();
    for (const [key, mood] of Object.entries(_ARTIST_HINTS)) {
      if (lower.includes(key)) return mood;
    }
  }

  // 3. Genre text (when genres ARE populated)
  const genreText = genres.join(' ').toLowerCase();
  if (!genreText) return null;

  if (/(edm|electronic|house|techno|trance|dubstep|drum.?and.?bass|dnb|dance.?pop|electro|club)/i.test(genreText)) {
    return 'electric';
  }
  if (/(rock|metal|punk|hardcore|k-pop|j-pop|anime|latin|reggaeton|afrobeat|hip.?hop|rap|trap|drill|pop)/i.test(genreText)) {
    return 'bold';
  }
  if (/(ambient|chill|lofi|lo-fi|new.?age|downtempo|sleep|classical|orchestral|piano|baroque|opera)/i.test(genreText)) {
    return 'calm';
  }
  if (/(folk|acoustic|singer.?songwriter|blues|indie.?folk)/i.test(genreText)) {
    return 'mellow';
  }
  if (/(r&b|soul|funk|disco|country|bossa|jazz)/i.test(genreText)) {
    return 'cozy';
  }

  return null;
}

// Derive features from artist genres + track metadata (works without /audio-features)
async function _deriveFeatures(token, track) {
  let fullTrack = track;
  try {
    if (track.id) fullTrack = await _fetchTrack(token, track.id);
  } catch (e) {
    console.warn('[Aurora × Spotify] track fetch failed, using partial data:', e.message);
  }

  let genres = [];
  try {
    if (fullTrack.artists?.[0]?.id) {
      const artist = await _fetchArtist(token, fullTrack.artists[0].id);
      genres = artist.genres || [];
    }
  } catch (e) {
    console.warn('[Aurora × Spotify] artist fetch failed:', e.message);
  }

  const searchText = `${fullTrack.name || ''} ${fullTrack.album?.name || ''}`;
  const artistNames = (fullTrack.artists || []).map((a) => a.name);
  const genreMatch = _GENRE_PROFILES.find((p) => genres.some((g) => p.match.test(g)));
  const titleMatch = _TITLE_HINTS.find((p) => p.match.test(searchText));
  const moodHint = _inferMoodHint(genres, searchText, artistNames);

  let base = genreMatch || { energy: 0.55, valence: 0.55, tempo: 110, danceability: 0.6 };
  if (titleMatch) {
    base = {
      energy: (base.energy + titleMatch.energy) / 2,
      valence: (base.valence + titleMatch.valence) / 2,
      tempo: (base.tempo + titleMatch.tempo) / 2,
      danceability: (base.danceability + titleMatch.danceability) / 2,
    };
  }

  const popularity = (fullTrack.popularity ?? 50) / 100;
  const durationMs = fullTrack.duration_ms || 200000;
  const isLong = durationMs > 300000;
  const isShort = durationMs < 150000;

  let energy = Math.min(1, base.energy * (0.8 + popularity * 0.35));
  let valence = Math.min(1, base.valence * (0.85 + popularity * 0.25));
  let tempo = base.tempo;
  let danceability = base.danceability;

  if (isLong) { energy *= 0.88; tempo *= 0.92; }
  if (isShort) { energy *= 1.08; tempo *= 1.05; }

  const seed = (fullTrack.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = (((seed % 100) / 100) - 0.5) * 0.12;
  energy = Math.min(1, Math.max(0.15, energy + jitter));
  valence = Math.min(1, Math.max(0.15, valence + jitter));
  tempo = Math.min(180, Math.max(60, tempo + jitter * 25));
  danceability = Math.min(1, Math.max(0.15, danceability + jitter));

  return {
    energy,
    valence,
    tempo,
    danceability,
    _source: genreMatch ? `genre:${genres[0] || 'matched'}` : titleMatch ? 'title-hint' : 'default',
    _genres: genres,
    _moodHint: moodHint,
    _track: fullTrack.name,
  };
}

// ─────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────
let _pollInterval = null;
let _lastTrackId = null;

async function _loadTrackAndApplyMood(token, track) {
  const features = await _deriveFeatures(token, track);
  _applyFeatures(features, true);

  const mood = _detectMood(features);

  console.log('%c[Aurora × Spotify] ✓ Mood detected', 'color:#1DB954;font-weight:bold', {
    track: features._track,
    mood,
    moodHint: features._moodHint || '(numeric fallback)',
    source: features._source,
    genres: features._genres.length ? features._genres.slice(0, 4) : '(none — artist lookup used)',
    energy: +features.energy.toFixed(2),
    valence: +features.valence.toFixed(2),
    tempo: Math.round(features.tempo),
    danceability: +features.danceability.toFixed(2),
  });

  if (typeof window.transitionToMood === 'function') {
    window.transitionToMood(mood, 1800);
  }

  _announceMood(mood, track);
}

async function _poll() {
  try {
    const token = await _getToken();
    const data = await _fetchCurrentTrack(token);

    if (!data || !data.item) {
      _setTrackDisplay(null);
      return;
    }

    _setTrackDisplay(data.item, data.is_playing !== false);

    if (data.item.id !== _lastTrackId) {
      _lastTrackId = data.item.id;
      console.log('%c[Aurora × Spotify] Track changed →', 'color:#1DB954;font-weight:bold',
        `${data.item.name} · ${data.item.artists.map((a) => a.name).join(', ')}`);
      await _loadTrackAndApplyMood(token, data.item);
    }
  } catch (err) {
    console.warn('[Aurora × Spotify]', err.message);
    if (err.message.includes('Refresh failed')) _disconnect();
  }
}

function _applyFeatures(features, snap = false) {
  _target.energy = features.energy;
  _target.valence = features.valence;
  _target.tempo = features.tempo;
  _target.danceability = features.danceability;

  if (snap) {
    const s = window.spotifyState;
    s.energy = features.energy;
    s.valence = features.valence;
    s.tempo = features.tempo;
    s.danceability = features.danceability;
  }
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────
// Mood detection from derived features → maps to one of the 6 mood chips
function _detectMood(features) {
  const { energy, valence, danceability, tempo } = features;

  // Artist/title/genre hint wins always — most reliable signal
  if (features._moodHint) return features._moodHint;

  // Numeric fallback — looser thresholds so neutral defaults don't all land on dreamy
  if (energy >= 0.75 || (energy >= 0.6 && danceability >= 0.75) || tempo >= 126) return 'electric';
  if (energy >= 0.55 || tempo >= 110) return 'bold';
  if (energy <= 0.3 && valence >= 0.35) return 'calm';
  if (valence <= 0.38 || energy <= 0.3) return 'mellow';
  if (valence >= 0.58 || danceability >= 0.65) return 'cozy';
  return 'dreamy';
}

const _MOOD_COPY = {
  calm: 'sounds like a calm moment',
  dreamy: 'sounds dreamy and floating',
  bold: 'feels confident and bold',
  cozy: 'has a cozy, warm pull',
  electric: 'is buzzing with energy',
  mellow: 'carries a mellow weight',
};

function _setTrackDisplay(track, isPlaying = true) {
  const trackEl = document.getElementById('spotifyTrack');
  const artistEl = document.getElementById('spotifyArtist');
  const artEl = document.getElementById('vinylArt');
  const discEl = document.getElementById('vinylDisc');
  const moodDetectEl = document.getElementById('moodDetect');

  if (!trackEl) return;

  if (!track) {
    trackEl.textContent = 'Waiting for music…';
    if (artistEl) artistEl.textContent = 'Open Spotify and press play';
    if (artEl) { artEl.removeAttribute('src'); artEl.classList.remove('loaded'); }
    if (discEl) discEl.classList.add('paused');
    if (moodDetectEl) moodDetectEl.textContent = '';
    return;
  }

  trackEl.textContent = track.name;
  if (artistEl) artistEl.textContent = track.artists.map((a) => a.name).join(', ');

  const artUrl = track.album?.images?.[0]?.url;
  if (artEl && artUrl && artEl.src !== artUrl) {
    artEl.classList.remove('loaded');
    artEl.onload = () => artEl.classList.add('loaded');
    artEl.src = artUrl;
  }

  if (discEl) discEl.classList.toggle('paused', !isPlaying);
  
  // Sync playback state for controls
  _isPlaying = isPlaying;
  _updatePlayPauseUI();
}

function _announceMood(mood, track) {
  const el = document.getElementById('moodDetect');
  if (!el || !mood) return;
  el.innerHTML = `This song ${_MOOD_COPY[mood] || 'feels unique'} <strong>${mood}</strong>`;
}

function _setConnectedUI(connected) {
  const btn = document.getElementById('spotifyConnectBtn');
  const view = document.getElementById('spotifyConnected');
  if (btn) btn.style.display = connected ? 'none' : 'flex';
  if (view) view.style.display = connected ? 'flex' : 'none';
}

// ─────────────────────────────────────────────────────────────
// Connect / disconnect
// ─────────────────────────────────────────────────────────────
async function _connect(token) {
  window.spotifyState.connected = true;
  _lastTrackId = null;
  _setConnectedUI(true);
  console.log('%c[Aurora × Spotify] Connected — genre-based audio mapping (no /audio-features)', 'color:#1DB954;font-weight:bold');
  await _poll();
  _pollInterval = setInterval(_poll, 4000);
}

function _disconnect() {
  window.spotifyState.connected = false;
  clearInterval(_pollInterval);
  _pollInterval = null;
  _lastTrackId = null;
  localStorage.removeItem('aurora_spotify_token');
  localStorage.removeItem('aurora_spotify_refresh');
  localStorage.removeItem('aurora_spotify_expiry');
  _setConnectedUI(false);
  _setTrackDisplay(null);
}

// ─────────────────────────────────────────────────────────────
// Boot — handle OAuth redirect or restore existing session
// ─────────────────────────────────────────────────────────────
(async function boot() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const authError = params.get('error');

  if (authError) {
    console.warn('[Aurora × Spotify] Auth error:', authError);
    return;
  }

  if (code) {
    // Strip the code from the URL so it's not bookmarked or shared
    const clean = new URLSearchParams(window.location.search);
    clean.delete('code');
    clean.delete('state');
    history.replaceState(null, '', window.location.pathname + (clean.toString() ? `?${clean}` : ''));

    try {
      const token = await _exchangeCode(code);
      await _connect(token);
    } catch (err) {
      console.error('[Aurora × Spotify] Code exchange failed:', err);
    }
    return;
  }

  const existing = localStorage.getItem('aurora_spotify_token');
  if (existing) {
    try {
      const token = await _getToken();
      await _connect(token);
    } catch {
      _disconnect();
    }
  }
})();

document.getElementById('spotifyConnectBtn').addEventListener('click', _initiateAuth);
document.getElementById('spotifyDisconnectBtn').addEventListener('click', _disconnect);

// Playback controls
document.getElementById('playPauseBtn').addEventListener('click', _playPause);
document.getElementById('nextBtn').addEventListener('click', _skipNext);
document.getElementById('prevBtn').addEventListener('click', _skipPrev);
