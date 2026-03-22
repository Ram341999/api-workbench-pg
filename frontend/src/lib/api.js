import axios from "axios";

// When served by FastAPI (production/unified mode), REACT_APP_BACKEND_URL is empty
// and all requests go to the same origin via relative paths.
// In dev mode (separate frontend dev server), set REACT_APP_BACKEND_URL=http://localhost:8000
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API_BASE = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Redirect to login on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const api = {
  // Auth
  getMe: async () => {
    const { data } = await client.get("/auth/me");
    return data;
  },
  registerEmail: async ({ email, password, name }) => {
    const { data } = await client.post("/auth/register", { email, password, name });
    return data;
  },
  loginEmail: async ({ email, password }) => {
    const { data } = await client.post("/auth/login", { email, password });
    return data;
  },
  loginWithGoogle: () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  },
  loginDemo: async () => {
    const { data } = await client.post("/auth/demo");
    return data;
  },
  logout: async () => {
    await client.post("/auth/logout");
  },

  // Collections
  getCollections: async () => { const { data } = await client.get("/collections"); return data; },
  createCollection: async (c) => { const { data } = await client.post("/collections", c); return data; },
  updateCollection: async (id, c) => { const { data } = await client.put(`/collections/${id}`, c); return data; },
  deleteCollection: async (id) => { await client.delete(`/collections/${id}`); },

  // Requests
  getRequests: async (collectionId) => {
    const params = collectionId ? { collection_id: collectionId } : {};
    const { data } = await client.get("/requests", { params });
    return data;
  },
  createRequest: async (r) => { const { data } = await client.post("/requests", r); return data; },
  updateRequest: async (id, r) => { const { data } = await client.put(`/requests/${id}`, r); return data; },
  deleteRequest: async (id) => { await client.delete(`/requests/${id}`); },

  // Environments
  getEnvironments: async () => { const { data } = await client.get("/environments"); return data; },
  createEnvironment: async (e) => { const { data } = await client.post("/environments", e); return data; },
  updateEnvironment: async (id, e) => { const { data } = await client.put(`/environments/${id}`, e); return data; },
  deleteEnvironment: async (id) => { await client.delete(`/environments/${id}`); },
  activateEnvironment: async (id) => { const { data } = await client.post(`/environments/${id}/activate`); return data; },

  // History
  getHistory: async (limit = 50) => { const { data } = await client.get("/history", { params: { limit } }); return data; },
  clearHistory: async () => { await client.delete("/history"); },

  // Execute
  executeRequest: async (request) => { const { data } = await client.post("/execute", request); return data; },

  // Import / Export
  exportCollection: async () => { const { data } = await client.get("/export"); return data; },
  importCollection: async (importData) => { const { data } = await client.post("/import", { data: importData }); return data; },
};
