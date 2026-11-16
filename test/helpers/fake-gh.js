// Fake GitHub client for bot tests: records calls, answers from route handlers.
// routes: array of [method, RegExp, (match, body) => response]
export function fakeGh(routes = []) {
  const calls = [];
  const gh = {
    calls,
    async rest(method, path, body) {
      calls.push({ method, path, body });
      for (const [m, re, fn] of routes) {
        const hit = m === method && path.match(re);
        if (hit) return fn(hit, body);
      }
      return method === "GET" ? [] : {};
    },
    async graphql(query, variables) {
      calls.push({ method: "GRAPHQL", query, variables });
      for (const [m, re, fn] of routes) {
        const hit = m === "GRAPHQL" && query.match(re);
        if (hit) return fn(hit, variables);
      }
      return {};
    },
  };
  return gh;
}

export const posts = (gh, re) => gh.calls.filter((c) => c.method === "POST" && re.test(c.path));
export const patches = (gh, re) => gh.calls.filter((c) => c.method === "PATCH" && re.test(c.path));
