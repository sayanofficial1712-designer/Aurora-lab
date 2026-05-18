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
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

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
  const speed = 0.025; // smooth but noticeable transitions between songs
  s.energy = lerp(s.energy, _target.energy, speed);
  s.valence = lerp(s.valence, _target.valence, speed);
  s.tempo = lerp(s.tempo, _target.tempo, speed);
  s.danceability = lerp(s.danceability, _target.danceability, speed);

  const bar = document.getElementById('spotifyEnergyFill');
  if (bar) bar.style.width = `${Math.round(s.energy * 100)}%`;
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

async function _fetchAudioFeatures(token, trackId) {
  const resp = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Audio features ${resp.status}`);
  return resp.json();
}

async function _fetchArtist(token, artistId) {
  const resp = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Artist ${resp.status}`);
  return resp.json();
}

// Genre → audio-feature heuristics (used when audio-features is blocked/403)
const _GENRE_PROFILES = [
  { match: /(edm|electronic|house|techno|trance|dubstep|dance)/i, energy: 0.85, valence: 0.7, tempo: 128, danceability: 0.85 },
  { match: /(rock|metal|punk|grunge)/i,                         energy: 0.8,  valence: 0.55, tempo: 130, danceability: 0.55 },
  { match: /(hip\s?hop|rap|trap|drill)/i,                       energy: 0.75, valence: 0.55, tempo: 95,  danceability: 0.8  },
  { match: /(pop)/i,                                             energy: 0.7,  valence: 0.7,  tempo: 115, danceability: 0.75 },
  { match: /(r&b|soul|funk|disco)/i,                             energy: 0.6,  valence: 0.7,  tempo: 100, danceability: 0.8  },
  { match: /(latin|reggaeton|salsa|samba|bossa)/i,               energy: 0.75, valence: 0.8,  tempo: 100, danceability: 0.85 },
  { match: /(jazz|blues|swing)/i,                                energy: 0.45, valence: 0.55, tempo: 110, danceability: 0.55 },
  { match: /(folk|acoustic|singer-songwriter|indie\s*folk)/i,    energy: 0.4,  valence: 0.5,  tempo: 95,  danceability: 0.45 },
  { match: /(classical|orchestral|piano|baroque|opera)/i,        energy: 0.35, valence: 0.45, tempo: 90,  danceability: 0.3  },
  { match: /(ambient|chill|lofi|lo-fi|new age|downtempo)/i,      energy: 0.3,  valence: 0.45, tempo: 80,  danceability: 0.5  },
  { match: /(country)/i,                                          energy: 0.55, valence: 0.6,  tempo: 105, danceability: 0.55 },
  { match: /(k-pop|j-pop|anime)/i,                               energy: 0.8,  valence: 0.75, tempo: 120, danceability: 0.8  },
];

// Fallback: derive features from track metadata when /audio-features is blocked
async function _deriveFeaturesFallback(token, track) {
  let genres = [];
  try {
    if (track.artists && track.artists[0]) {
      const artist = await _fetchArtist(token, track.artists[0].id);
      genres = artist.genres || [];
    }
  } catch (e) {
    console.warn('[Aurora × Spotify] artist fetch failed:', e.message);
  }

  const matched = _GENRE_PROFILES.find((p) => genres.some((g) => p.match.test(g)));
  const base = matched || { energy: 0.55, valence: 0.55, tempo: 110, danceability: 0.6 };

  // Popularity nudge (more popular tracks tend to be slightly more energetic/upbeat)
  const popularity = (track.popularity ?? 50) / 100;
  const energy = Math.min(1, base.energy * (0.85 + popularity * 0.3));
  const valence = Math.min(1, base.valence * (0.9 + popularity * 0.2));

  // Vary slightly by track id so different songs in same genre differ
  const seed = (track.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = (((seed % 100) / 100) - 0.5) * 0.15;

  return {
    energy: Math.min(1, Math.max(0, energy + jitter)),
    valence: Math.min(1, Math.max(0, valence + jitter)),
    tempo: base.tempo + jitter * 30,
    danceability: Math.min(1, Math.max(0, base.danceability + jitter)),
    _source: matched ? `fallback:${matched.match}` : 'fallback:default',
    _genres: genres,
  };
}

// ─────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────
let _pollInterval = null;
let _lastTrackId = null;
let _audioFeaturesBlocked = false; // becomes true after first 403, then we skip it

async function _poll() {
  try {
    const token = await _getToken();
    const data = await _fetchCurrentTrack(token);

    if (!data || !data.item) {
      _setTrackDisplay(null);
      return;
    }

    _setTrackDisplay(data.item);

    if (data.item.id !== _lastTrackId) {
      _lastTrackId = data.item.id;
      console.log('%c[Aurora × Spotify] Track changed →', 'color:#1DB954;font-weight:bold',
        `${data.item.name} · ${data.item.artists.map((a) => a.name).join(', ')}`);

      let features = null;
      let usedFallback = false;

      if (!_audioFeaturesBlocked) {
        try {
          features = await _fetchAudioFeatures(token, data.item.id);
          features._source = 'audio-features';
        } catch (e) {
          if (e.message.includes('403') || e.message.includes('401')) {
            console.warn('[Aurora × Spotify] /audio-features blocked (likely deprecated for new apps). Switching to genre-based fallback.');
            _audioFeaturesBlocked = true;
          } else {
            console.warn('[Aurora × Spotify] audio-features failed:', e.message);
          }
        }
      }

      if (!features) {
        features = await _deriveFeaturesFallback(token, data.item);
        usedFallback = true;
      }

      _applyFeatures(features);

      console.log('[Aurora × Spotify] Features', {
        source: features._source,
        ...(features._genres ? { genres: features._genres } : {}),
        energy: +features.energy.toFixed(2),
        valence: +features.valence.toFixed(2),
        tempo: +features.tempo.toFixed(0),
        danceability: +features.danceability.toFixed(2),
        fallback: usedFallback,
      });
    }
  } catch (err) {
    console.warn('[Aurora × Spotify]', err.message);
    if (err.message.includes('Refresh failed')) _disconnect();
  }
}

function _applyFeatures(features) {
  _target.energy = features.energy;
  _target.valence = features.valence;
  _target.tempo = features.tempo;
  _target.danceability = features.danceability;
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────
function _setTrackDisplay(track) {
  const el = document.getElementById('spotifyTrack');
  if (!el) return;
  if (!track) {
    el.textContent = 'Nothing playing — open Spotify and play a song';
    return;
  }
  const artists = track.artists.map((a) => a.name).join(', ');
  el.textContent = `${track.name}  ·  ${artists}`;
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
  _setConnectedUI(true);
  console.log('%c[Aurora × Spotify] Connected', 'color:#1DB954;font-weight:bold');
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
