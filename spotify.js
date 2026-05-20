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
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-private user-read-recently-played';

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
let _isPremium = true; // updated from control responses
let _premiumRestrictionDetected = false;

function _showControlFeedback(msg, isError = false) {
  const el = document.getElementById('playbackMsg');
  if (!el || !window.spotifyState?.connected) return;
  el.textContent = msg;
  el.style.color = isError ? 'rgba(200,60,60,0.85)' : 'rgba(29,185,84,0.9)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 3000);
}

async function _controlFetch(method, endpoint, body) {
  const token = await _getToken();
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const resp = await fetch(endpoint, opts);
  if (resp.status === 403) {
    _isPremium = false;
    _premiumRestrictionDetected = true;
    _showControlFeedback('Playback control requires Spotify Premium', true);
    return null;
  }
  if (resp.status === 404) {
    _showControlFeedback('No active Spotify device — open Spotify on any device first', true);
    return null;
  }
  if (resp.status === 401) {
    _showControlFeedback('Re-connect Spotify to enable controls', true);
    return null;
  }
  if (resp.ok || resp.status === 204) {
    _isPremium = true;
    _premiumRestrictionDetected = false;
    _showControlFeedback('Playback synced');
  }
  return resp;
}

async function _playPause() {
  const endpoint = _isPlaying
    ? 'https://api.spotify.com/v1/me/player/pause'
    : 'https://api.spotify.com/v1/me/player/play';
  const resp = await _controlFetch('PUT', endpoint);
  if (resp) {
    _isPlaying = !_isPlaying;
    _updatePlayPauseUI();
    setTimeout(_poll, 800);
  }
}

async function _skipNext() {
  const resp = await _controlFetch('POST', 'https://api.spotify.com/v1/me/player/next');
  if (resp) {
    _lastTrackId = null; // force mood re-detect on next poll
    setTimeout(_poll, 1000);
  }
}

async function _skipPrev() {
  const resp = await _controlFetch('POST', 'https://api.spotify.com/v1/me/player/previous');
  if (resp) {
    _lastTrackId = null;
    setTimeout(_poll, 1000);
  }
}

async function _playTrackUri(uri, trackName) {
  const resp = await _controlFetch('PUT', 'https://api.spotify.com/v1/me/player/play', { uris: [uri] });
  if (resp) {
    _showControlFeedback(`Controlling your Spotify session`);
    _lastTrackId = null;
    _hideSearchResults();
    document.getElementById('searchInput').value = '';
    setTimeout(_poll, 1000);
  }
}

function _updatePlayPauseUI() {
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.classList.toggle('playing', _isPlaying);
  const hero = document.getElementById('playerHero');
  if (hero) hero.classList.toggle('is-playing', _isPlaying);
  const wrap = document.querySelector('.player-cover-wrap');
  if (wrap) wrap.classList.toggle('is-playing', _isPlaying);
}

// ─── Progress bar ───
let _progressMs = 0;
let _durationMs = 0;
let _progressLastTick = Date.now();

function _formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function _syncProgressFromSpotify(progressMs, durationMs) {
  _progressMs = progressMs;
  _durationMs = durationMs;
  _progressLastTick = Date.now();
  _updateProgressUI();
}

function _updateProgress(progressMs, durationMs) {
  _progressMs = progressMs;
  _durationMs = durationMs;
  _updateProgressUI();
}

function _updateProgressUI() {
  const fill = document.getElementById('progressFill');
  const cur = document.getElementById('progressTime');
  const dur = document.getElementById('durationTime');
  if (!fill) return;
  const pct = _durationMs > 0 ? (_progressMs / _durationMs) * 100 : 0;
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (cur) cur.textContent = _formatTime(_progressMs);
  if (dur) dur.textContent = _formatTime(_durationMs);
}

// Tick progress locally between polls so the bar moves smoothly
function _tickProgress() {
  if (!_isPlaying || !_durationMs) return;
  const now = Date.now();
  _progressMs = Math.min(_durationMs, _progressMs + (now - _progressLastTick));
  _progressLastTick = now;
  _updateProgressUI();
}
setInterval(_tickProgress, 500);

async function _seekTo(positionMs) {
  if (!_durationMs) return;
  const clamped = Math.max(0, Math.min(_durationMs, positionMs));
  const resp = await _controlFetch('PUT', `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(clamped)}`);
  if (resp) {
    _progressMs = clamped;
    _progressLastTick = Date.now();
    _updateProgressUI();
  }
}

// ─── Volume control ───
let _volumeSyncedFromSpotify = false;
let _volumeTimer = null;

function _syncVolumeFromSpotify(percent) {
  const slider = document.getElementById('volumeSlider');
  if (!slider || _volumeSyncedFromSpotify) return; // sync once on connect
  slider.value = percent;
  _volumeSyncedFromSpotify = true;
}

async function _setVolume(percent) {
  await _controlFetch('PUT', `https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(percent)}`);
}

// ─────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────
let _searchTimer = null;

async function _searchTracks(query) {
  if (!query.trim()) { _hideSearchResults(); return; }
  try {
    const token = await _getToken();
    const resp = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return;
    const data = await resp.json();
    _showSearchResults(data.tracks?.items || []);
  } catch (err) {
    console.warn('[Aurora × Spotify] search error:', err.message);
  }
}

function _showSearchResults(tracks) {
  const list = document.getElementById('searchResults');
  if (!list) return;
  list.innerHTML = '';
  if (!tracks.length) {
    list.innerHTML = '<li class="search-empty">No results</li>';
    list.style.display = 'block';
    return;
  }
  tracks.forEach((track) => {
    const li = document.createElement('li');
    li.className = 'search-result-item';
    li.innerHTML = `
      <div class="search-result-info">
        <span class="search-result-track">${track.name}</span>
        <span class="search-result-artist">${track.artists.map((a) => a.name).join(', ')}</span>
      </div>
      <button type="button" class="search-play-btn" aria-label="Play ${track.name}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    `;
    li.querySelector('.search-play-btn').addEventListener('click', () => {
      _playTrackUri(track.uri, track.name);
    });
    list.appendChild(li);
  });
  list.style.display = 'block';
}

function _hideSearchResults() {
  const list = document.getElementById('searchResults');
  if (list) list.style.display = 'none';
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
  const libMood = typeof window.toLibraryMood === 'function' ? window.toLibraryMood(mood) : mood;
  const confidence = _computeConfidence(features, libMood);

  if (typeof window.setMoodConfidence === 'function') {
    window.setMoodConfidence(confidence);
  }

  console.log('%c[Aurora × Spotify] ✓ Mood detected', 'color:#1DB954;font-weight:bold', {
    track: features._track,
    mood,
    libraryMood: libMood,
    confidence: `${confidence}%`,
    moodHint: features._moodHint || '(numeric fallback)',
    source: features._source,
    genres: features._genres.length ? features._genres.slice(0, 4) : '(none — artist lookup used)',
    energy: +features.energy.toFixed(2),
    valence: +features.valence.toFixed(2),
    tempo: Math.round(features.tempo),
    danceability: +features.danceability.toFixed(2),
  });

  const autoOn = window._auroraAutoMode !== false;
  if (autoOn && typeof window.transitionToMood === 'function') {
    window.transitionToMood(libMood, 1800);
  }

  _announceMood(libMood, track, confidence);
}

async function _poll() {
  try {
    const token = await _getToken();
    const data = await _fetchCurrentTrack(token);

    if (!data || !data.item) {
      _setTrackDisplay(null);
      return;
    }

    _setTrackDisplay(data.item, data.is_playing !== false, data);

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
function _computeConfidence(features, mood) {
  const { energy, valence, danceability, tempo } = features;
  let score = 55;

  if (features._moodHint === mood || features._moodHint === 'mellow' && mood === 'calm') {
    score = 88;
  } else {
    const profiles = {
      electric: { energy: 0.85, valence: 0.7, danceability: 0.85, tempo: 128 },
      bold: { energy: 0.65, valence: 0.55, danceability: 0.6, tempo: 115 },
      cozy: { energy: 0.45, valence: 0.72, danceability: 0.65, tempo: 100 },
      calm: { energy: 0.25, valence: 0.5, danceability: 0.35, tempo: 75 },
      dreamy: { energy: 0.45, valence: 0.55, danceability: 0.5, tempo: 95 },
    };
    const p = profiles[mood] || profiles.dreamy;
    const dist =
      Math.abs(energy - p.energy) +
      Math.abs(valence - p.valence) +
      Math.abs(danceability - p.danceability) +
      Math.min(1, Math.abs(tempo - p.tempo) / 80);
    score = Math.round(78 - dist * 35);
  }

  return Math.max(42, Math.min(96, score));
}

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

function _setTrackDisplay(track, isPlaying = true, playbackData = null) {
  const trackEl = document.getElementById('spotifyTrack');
  const artistEl = document.getElementById('spotifyArtist');
  const coverEl = document.getElementById('playerCover');
  const npTrackEl = document.getElementById('npTrack');
  const npArtistEl = document.getElementById('npArtist');
  const hintEl = document.getElementById('moodLibraryHint');

  if (!trackEl) return;

  if (!track) {
    trackEl.textContent = 'Nothing playing';
    if (artistEl) artistEl.textContent = 'Connect Spotify to begin';
    if (npTrackEl) npTrackEl.textContent = 'How does this moment feel?';
    if (npArtistEl) npArtistEl.textContent = '';
    if (coverEl) {
      coverEl.removeAttribute('src');
      coverEl.classList.remove('loaded');
    }
    if (hintEl && window._auroraAutoMode !== false) {
      hintEl.textContent = 'Connect Spotify — your music will guide the carousel';
    }
    _isPlaying = false;
    _updatePlayPauseUI();
    _updateProgress(0, 0);
    return;
  }

  const artists = track.artists.map((a) => a.name).join(', ');

  trackEl.textContent = track.name;
  if (artistEl) artistEl.textContent = artists;
  if (npTrackEl) npTrackEl.textContent = track.name;
  if (npArtistEl) npArtistEl.textContent = artists;

  const artUrl = track.album?.images?.[0]?.url;
  if (coverEl && artUrl) {
    if (coverEl.src !== artUrl) {
      coverEl.classList.remove('loaded');
      coverEl.onload = () => coverEl.classList.add('loaded');
      coverEl.src = artUrl;
      coverEl.alt = `${track.name} album art`;
    } else if (!coverEl.classList.contains('loaded')) {
      coverEl.classList.add('loaded');
    }
  }

  _isPlaying = isPlaying;
  _updatePlayPauseUI();

  if (playbackData) {
    _syncProgressFromSpotify(playbackData.progress_ms || 0, track.duration_ms || 0, isPlaying);
    if (typeof playbackData.device?.volume_percent === 'number') {
      _syncVolumeFromSpotify(playbackData.device.volume_percent);
    }
  }
}

function _announceMood(mood, track, confidence = 0) {
  const npMoodEl = document.getElementById('npMood');
  const hintEl = document.getElementById('moodLibraryHint');
  if (!mood) return;

  const label = mood.charAt(0).toUpperCase() + mood.slice(1);
  const msg = `This song ${_MOOD_COPY[mood] || 'feels unique'} — <strong>${label}</strong>`;
  if (npMoodEl) npMoodEl.innerHTML = msg;
  if (hintEl && window._auroraAutoMode !== false) {
    hintEl.textContent = confidence
      ? `Auto · ${label} · ${Math.round(confidence)}% match`
      : `Auto · ${label}`;
  }
}

function _setConnectedUI(connected) {
  document.body.classList.toggle('spotify-connected', connected);
}

// ─────────────────────────────────────────────────────────────
// Connect / disconnect
// ─────────────────────────────────────────────────────────────
async function _connect(token) {
  window.spotifyState.connected = true;
  _lastTrackId = null;
  _isPremium = true;
  _premiumRestrictionDetected = false;
  _volumeSyncedFromSpotify = false;
  _setConnectedUI(true);
  _showControlFeedback('Controlling your Spotify session');
  console.log('%c[Aurora × Spotify] Connected — genre-based audio mapping (no /audio-features)', 'color:#1DB954;font-weight:bold');
  await _poll();
  _pollInterval = setInterval(_poll, 4000);
}

function _disconnect() {
  window.spotifyState.connected = false;
  clearInterval(_pollInterval);
  _pollInterval = null;
  _lastTrackId = null;
  _isPremium = true;
  _premiumRestrictionDetected = false;
  localStorage.removeItem('aurora_spotify_token');
  localStorage.removeItem('aurora_spotify_refresh');
  localStorage.removeItem('aurora_spotify_expiry');
  _setConnectedUI(false);
  _setTrackDisplay(null);
  const feedback = document.getElementById('playbackMsg');
  if (feedback) feedback.textContent = '';
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

const _connectBtn = document.getElementById('spotifyConnectBtn');
const _disconnectBtn = document.getElementById('spotifyDisconnectBtn');
if (_connectBtn) _connectBtn.addEventListener('click', _initiateAuth);
if (_disconnectBtn) _disconnectBtn.addEventListener('click', _disconnect);

// Playback controls
document.getElementById('playPauseBtn').addEventListener('click', _playPause);
document.getElementById('nextBtn').addEventListener('click', _skipNext);
document.getElementById('prevBtn').addEventListener('click', _skipPrev);

// Search
const _searchInput = document.getElementById('searchInput');
_searchInput.addEventListener('input', (e) => {
  clearTimeout(_searchTimer);
  const q = e.target.value.trim();
  if (!q) { _hideSearchResults(); return; }
  _searchTimer = setTimeout(() => _searchTracks(q), 350);
});

_searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { _hideSearchResults(); _searchInput.value = ''; }
});

// Close results when clicking outside
document.addEventListener('click', (e) => {
  const section = document.querySelector('.drawer-search-wrap');
  if (section && !section.contains(e.target)) _hideSearchResults();
});

// ─── Volume slider ───
const _volumeSlider = document.getElementById('volumeSlider');
if (_volumeSlider) {
  _volumeSlider.addEventListener('input', (e) => {
    clearTimeout(_volumeTimer);
    const v = Number(e.target.value);
    _volumeTimer = setTimeout(() => _setVolume(v), 250);
  });
}

// ─── Progress bar seek ───
const _progressTrack = document.getElementById('progressTrack');
if (_progressTrack) {
  _progressTrack.addEventListener('click', (e) => {
    if (!_durationMs) return;
    const rect = _progressTrack.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    _seekTo(pct * _durationMs);
  });
}

window._auroraAutoMode = true;
window._auroraManualLock = false;

// ─── Expand / Focus mode ───
const _expandBtn = document.getElementById('expandBtn');
if (_expandBtn) {
  _expandBtn.addEventListener('click', () => {
    document.body.classList.toggle('focus-mode');
  });
}

