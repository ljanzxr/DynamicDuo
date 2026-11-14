// Talks to the FastAPI backend (backend/app.py).
// Change the address with VITE_API_URL in frontend/.env if the backend runs elsewhere.
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(`Cannot reach the API at ${API_BASE}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).detail || '';
    } catch {
      // response had no JSON body
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getEnvironments = () => request('/api/environments');
export const getExperiments = () => request('/api/experiments');
export const getRanking = (envId) => request(`/api/rank/${encodeURIComponent(envId)}`);
export const askQuestion = (question) =>
  request('/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });