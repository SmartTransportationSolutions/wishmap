// Minimal GitHub REST + GraphQL client over fetch. No dependencies.
// Error messages never include request bodies or variables (they may hold wish text).

export class GhError extends Error {
  constructor({ status, message, path }) {
    super(message);
    this.name = "GhError";
    this.status = status;
    this.path = path;
  }
}

export function createGh({ token, fetchImpl = fetch, apiUrl = "https://api.github.com" }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
    "user-agent": "sts-wishmap",
  };

  async function rest(method, path, body) {
    const res = await fetchImpl(apiUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return null;
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok) {
      const msg = payload && typeof payload.message === "string" ? payload.message : "request failed";
      throw new GhError({ status: res.status, message: `${method} ${path}: ${res.status} ${msg}`, path });
    }
    return payload;
  }

  // allowPartial: when GitHub returns data AND errors (e.g. one field forbidden), keep the data
  // and report only the error count via onPartial — so one bad field can't freeze the map.
  async function graphql(query, variables = {}, { allowPartial = false, onPartial } = {}) {
    const res = await fetchImpl(apiUrl + "/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok) {
      throw new GhError({ status: res.status, message: `graphql: ${res.status}`, path: "/graphql" });
    }
    if (payload && Array.isArray(payload.errors) && payload.errors.length) {
      if (allowPartial && payload.data) {
        onPartial?.(payload.errors.length);
        return payload.data;
      }
      const types = payload.errors.map((e) => e.type || "ERROR").join(",");
      throw new GhError({ status: res.status, message: `graphql errors: ${types}`, path: "/graphql" });
    }
    return payload ? payload.data : null;
  }

  return { rest, graphql };
}
