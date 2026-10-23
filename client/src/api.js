// Small API helper with JWT auth.

const TOKEN_KEY = 'events_scoring_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired / invalid
    setToken(null);
    window.dispatchEvent(new Event('events-scoring:unauthorized'));
  }

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = new Error((body && body.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const auth = {
  login: (username, password) =>
    api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => api('/auth/me'),
  list: (competitionId) => api(`/auth${competitionId ? `?competition=${competitionId}` : ''}`),
  create: (data) => api('/auth', { method: 'POST', body: JSON.stringify(data) }),
  updateCompetition: (id, competitionId) =>
    api(`/auth/${id}`, { method: 'PUT', body: JSON.stringify({ competition_id: competitionId }) }),
  resetPassword: (id, password) =>
    api(`/auth/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  changeOwnPassword: (current_password, password) =>
    api('/auth/me/password', { method: 'PUT', body: JSON.stringify({ current_password, password }) }),
  remove: (id) => api(`/auth/${id}`, { method: 'DELETE' }),
};

export const competitions = {
  list: () => api('/competitions'),
};

export const candidates = {
  list: (competitionId) => api(`/candidates${competitionId ? `?competition=${competitionId}` : ''}`),
  create: (data) => api('/candidates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/candidates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/candidates/${id}`, { method: 'DELETE' }),
  uploadPhoto: (id, formData, segmentId) => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    if (segmentId) formData.append('segment_id', segmentId);
    return api(`/candidates/${id}/photo`, { method: 'POST', body: formData, headers });
  },
  removePhoto: (id, segmentId) =>
    api(`/candidates/${id}/photo${segmentId ? `?segment_id=${segmentId}` : ''}`, { method: 'DELETE' }),
};

export const teams = {
  list: (competitionId) => api(`/teams${competitionId ? `?competition=${competitionId}` : ''}`),
  create: (data) => api('/teams', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => api(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => api(`/teams/${id}`, { method: 'DELETE' }),
};

export const segmentsApi = {
  list: (competitionId) => api(`/segments${competitionId ? `?competition=${competitionId}` : ''}`),
  update: (id, data) => api(`/segments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateCriteria: (id, data) =>
    api(`/segments/criteria/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const scoresApi = {
  get: (segment, judge) => api(`/scores?segment=${segment}${judge ? `&judge=${judge}` : ''}`),
  save: (payload) => api('/scores', { method: 'PUT', body: JSON.stringify(payload) }),
  bulk: (payload) => api('/scores/bulk', { method: 'POST', body: JSON.stringify(payload) }),
  reset: (password) => api('/scores/reset', { method: 'DELETE', body: JSON.stringify({ password }) }),
};

export const resultsApi = {
  get: (competitionId) => api(`/results${competitionId ? `?competition=${competitionId}` : ''}`),
};

export const settingsApi = {
  system: () => api('/settings/system'),
  setLocked: (locked) => api('/settings/system', { method: 'PUT', body: JSON.stringify({ locked }) }),
};