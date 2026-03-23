import axios from "axios";

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

// ─── Browser-side request executor ───────────────────────────────────────────
// Runs fetch() directly from the user's browser — supports localhost, private
// networks, and any URL the user's machine can reach.
async function browserExecute(request) {
  const t0 = performance.now();

  // Build headers
  const headers = {};
  (request.headers || []).forEach((h) => {
    if (h.enabled && h.key) headers[h.key] = h.value;
  });

  // Auth
  const auth = request.auth || {};
  if (auth.type === "bearer" && auth.bearer_token) {
    headers["Authorization"] = `Bearer ${auth.bearer_token}`;
  } else if (auth.type === "basic" && auth.basic_username) {
    headers["Authorization"] =
      "Basic " + btoa(`${auth.basic_username}:${auth.basic_password || ""}`);
  } else if (auth.type === "api_key" && auth.api_key_name && auth.api_key_value) {
    if ((auth.api_key_location || "header") === "header") {
      headers[auth.api_key_name] = auth.api_key_value;
    }
  }

  // Build URL + query params
  let url = request.url;
  const params = (request.params || []).filter((p) => p.enabled && p.key);
  if (
    auth.type === "api_key" &&
    auth.api_key_location === "query" &&
    auth.api_key_name
  ) {
    params.push({ key: auth.api_key_name, value: auth.api_key_value });
  }
  if (params.length > 0) {
    const qs = new URLSearchParams(
      params.map((p) => [p.key, p.value])
    ).toString();
    url = url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
  }

  // Body
  const method = (request.method || "GET").toUpperCase();
  let body = undefined;
  if (["POST", "PUT", "PATCH"].includes(method) && request.body) {
    body = request.body;
    if (!headers["Content-Type"]) {
      const ctMap = {
        json: "application/json",
        xml: "application/xml",
        form: "application/x-www-form-urlencoded",
        text: "text/plain",
      };
      headers["Content-Type"] = ctMap[request.body_type] || "application/json";
    }
  }

  // Fire the request from the browser
  let resp;
  try {
    resp = await fetch(url, { method, headers, body, redirect: "follow" });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    // Record failed attempt in history
    try {
      await client.post("/history/record", {
        method, url, status_code: 0,
        response_time: elapsed, response_size: 0,
        request_name: url.split("?")[0].split("/").pop() || "Request",
      });
    } catch {}

    const isCorsOrNetwork =
      err.message.includes("Failed to fetch") ||
      err.message.includes("NetworkError") ||
      err.message.includes("Load failed");

    throw new Error(
      isCorsOrNetwork
        ? `Cannot reach ${url}\n\nIf testing a localhost API:\n` +
          `1. Make sure your local server is running\n` +
          `2. Enable CORS on your local server (allow origin: *)\n` +
          `3. Check the port number is correct\n\n` +
          `Quick CORS fix for Express: app.use(require('cors')())\n` +
          `Quick CORS fix for FastAPI: add CORSMiddleware with allow_origins=["*"]`
        : err.message
    );
  }

  const elapsed = Math.round(performance.now() - t0);
  const respText = await resp.text();

  // Collect response headers
  const respHeaders = {};
  resp.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  // Save to history (fire and forget)
  const reqName =
    url.split("?")[0].split("/").filter(Boolean).pop() || "Request";
  try {
    await client.post("/history/record", {
      method, url,
      status_code: resp.status,
      response_time: elapsed,
      response_size: respText.length,
      request_name: reqName,
    });
  } catch {}

  return {
    status_code: resp.status,
    headers: respHeaders,
    body: respText,
    response_time: elapsed,
    response_size: respText.length,
    redirect_count: 0,
    final_url: resp.url || url,
  };
}

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
  getCollections: async () => {
    const { data } = await client.get("/collections");
    return data;
  },
  createCollection: async (c) => {
    const { data } = await client.post("/collections", c);
    return data;
  },
  updateCollection: async (id, c) => {
    const { data } = await client.put(`/collections/${id}`, c);
    return data;
  },
  deleteCollection: async (id) => {
    await client.delete(`/collections/${id}`);
  },

  // Requests
  getRequests: async (collectionId) => {
    const params = collectionId ? { collection_id: collectionId } : {};
    const { data } = await client.get("/requests", { params });
    return data;
  },
  createRequest: async (r) => {
    const { data } = await client.post("/requests", r);
    return data;
  },
  updateRequest: async (id, r) => {
    const { data } = await client.put(`/requests/${id}`, r);
    return data;
  },
  deleteRequest: async (id) => {
    await client.delete(`/requests/${id}`);
  },

  // Environments
  getEnvironments: async () => {
    const { data } = await client.get("/environments");
    return data;
  },
  createEnvironment: async (e) => {
    const { data } = await client.post("/environments", e);
    return data;
  },
  updateEnvironment: async (id, e) => {
    const { data } = await client.put(`/environments/${id}`, e);
    return data;
  },
  deleteEnvironment: async (id) => {
    await client.delete(`/environments/${id}`);
  },
  activateEnvironment: async (id) => {
    const { data } = await client.post(`/environments/${id}/activate`);
    return data;
  },

  // History
  getHistory: async (limit = 50) => {
    const { data } = await client.get("/history", { params: { limit } });
    return data;
  },
  clearHistory: async () => {
    await client.delete("/history");
  },

  // Execute — runs from the browser directly (supports localhost!)
  executeRequest: browserExecute,

  // Import / Export
  exportCollection: async () => {
    const { data } = await client.get("/export");
    return data;
  },
  importCollection: async (importData) => {
    const { data } = await client.post("/import", { data: importData });
    return data;
  },
};
