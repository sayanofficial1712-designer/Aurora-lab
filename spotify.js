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
  const speed = 0.015; // gentle transition between songs
  s.energy = lerp(s.energy, _target.energy, speed);
  s.valence = lerp(s.valence, _target.valence, speed);
  s.tempo = lerp(s.tempo, _target.tempo, speed);
  s.danceability = lerp(s.danceability, _target.danceability, speed);

  // Update visual energy bar in UI
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

// ─────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────
let _pollInterval = null;
let _lastTrackId = null;

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
      const features = await _fetchAudioFeatures(token, data.item.id);
      _applyFeatures(features);
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
  await _poll();
  _pollInterval = setInterval(_poll, 8000);
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
