import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.BASE_URL ?? "http://frontend:3000";
const suffix = randomUUID();
const credentials = {
  email: `qa-${suffix}@example.test`,
  password: `Local-test-${randomUUID()}`,
  displayName: "账户验收",
};
async function client() {
  const person = { cookie: "", identity: null };
  person.request = async (
    path,
    { data, method = data ? "POST" : "GET", body, headers = {} } = {},
  ) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Cookie: person.cookie,
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: data ? JSON.stringify(data) : body,
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie && response.ok) person.cookie = cookie.split(";")[0];
    return response;
  };
  person.auth = async (path, data, status = 200) => {
    const response = await person.request(path, { data });
    assert.equal(
      response.status,
      status,
      `${path}: ${await response.clone().text()}`,
    );
    const result = await response.json();
    assert.equal(result.passwordHash, undefined);
    assert.equal(result.tokenHash, undefined);
    if (response.ok) person.identity = result;
    return result;
  };
  await person.auth("/session", {});
  return person;
}
async function work(person, delayMs = 0) {
  const png = await (
    await person.request("/templates/travel-postcard/cover")
  ).blob();
  const form = new FormData();
  form.append("file", png, "account-test.png");
  const uploaded = await person.request("/assets", {
    method: "POST",
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const asset = await uploaded.json();
  const response = await person.request("/tasks", {
    data: {
      templateId: "travel-postcard",
      assetIds: [asset.id],
      simulation: { delayMs },
    },
  });
  assert.equal(response.status, 202);
  return { task: await response.json(), asset };
}
async function readable(person, item, status = 200) {
  assert.equal((await person.request(`/tasks/${item.task.id}`)).status, status);
  assert.equal(
    (await person.request(`/assets/${item.asset.id}/content`)).status,
    status,
  );
}
const guest = await client();
const guestId = guest.identity.id;
const guestCookie = guest.cookie;
const original = await work(guest);
await guest.auth("/auth/register", { ...credentials, password: "short" }, 400);
await guest.auth(
  "/auth/register",
  { ...credentials, password: "汉".repeat(25) },
  400,
);
const blocked = await guest.request("/auth/register", {
  data: credentials,
  headers: { Origin: "https://untrusted.example" },
});
assert.equal(blocked.status, 403);
await guest.auth("/auth/register", credentials, 201);
assert.equal(guest.identity.registered, true);
assert.equal(
  guest.identity.id,
  guestId,
  "registration keeps original owner and work",
);
assert.notEqual(
  guest.cookie,
  guestCookie,
  "registration rotates the session token",
);
await readable(guest, original);
assert.equal(
  (await fetch(`${base}/api/tasks`, { headers: { Cookie: guestCookie } }))
    .status,
  401,
);

const second = await client();
const secondGuest = second.identity.id;
const extra = await work(second, 800);
await second.auth(
  "/auth/register",
  { ...credentials, email: credentials.email.toUpperCase() },
  409,
);
const beforeWrong = second.cookie;
await second.auth(
  "/auth/login",
  { ...credentials, password: "incorrect-password" },
  401,
);
assert.equal(second.cookie, beforeWrong);
await readable(second, original, 404);
await second.auth("/auth/login", {
  ...credentials,
  email: credentials.email.toUpperCase(),
});
assert.equal(
  second.identity.id,
  guestId,
  "other browser signs into same account",
);
assert.equal(second.identity.pendingTasks, 1);
await readable(second, original);
await readable(second, extra, 404);
await readable(guest, extra, 404);
const loginCookie = second.cookie;
await second.auth("/auth/logout", {});
assert.equal(
  second.identity.id,
  secondGuest,
  "unbound guest restored on logout",
);
await readable(second, extra);
await readable(second, original, 404);
assert.equal(
  (await fetch(`${base}/api/tasks`, { headers: { Cookie: loginCookie } }))
    .status,
  401,
);
await second.auth("/auth/login", credentials);
await second.auth("/auth/bind", {});
assert.equal(second.identity.pendingGuest, false);
await readable(second, extra);
await readable(guest, extra);
await second.auth("/auth/bind", {}); // idempotent, no duplicate records
const history = await (await guest.request("/tasks")).json();
assert.equal(history.items.filter((t) => t.id === extra.task.id).length, 1);

// Separate registered identities can never bind each other's records.
const stranger = await client();
await stranger.auth(
  "/auth/register",
  { ...credentials, email: `other-${suffix}@example.test` },
  201,
);
await readable(stranger, original, 404);
await stranger.auth("/auth/login", credentials, 409);
await stranger.auth("/auth/bind", { guestId });
await readable(stranger, original, 404);
await second.auth("/auth/logout", {});
assert.equal(second.identity.registered, false);
assert.notEqual(
  second.identity.id,
  secondGuest,
  "bound guest is retired, logout creates a fresh guest",
);
await readable(second, extra, 404);
await readable(guest, original); // logout revokes only current account session
await second.auth("/auth/login", credentials);
await readable(second, extra);
for (let i = 0; i < 60; i++) {
  const state = await (await second.request(`/tasks/${extra.task.id}`)).json();
  if (state.task.status === "SUCCEEDED") break;
  assert.notEqual(state.task.status, "FAILED");
  await new Promise((resolve) => setTimeout(resolve, 200));
}
assert.equal(
  (await second.request(`/tasks/${extra.task.id}/result`)).status,
  200,
);
// A single old guest token cannot mint two authenticated sessions concurrently.
const racing = await client();
const simultaneous = await Promise.all([0, 1].map(() => fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { Cookie: racing.cookie, "Content-Type": "application/json" },
  body: JSON.stringify(credentials),
})));
assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 401]);
console.log(
  "PASS accounts: registration binding, cross-browser login, explicit merge, guest recovery, session rotation/logout, ownership isolation, validation, origin and in-flight result",
);
