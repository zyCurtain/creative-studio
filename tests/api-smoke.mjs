import assert from "node:assert/strict";
const base = process.env.BASE_URL ?? "http://frontend:3000";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const person = async () => {
  const r = await fetch(base + "/api/session", { method: "POST" });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
};
const owner = await person(),
  other = await person();
async function request(
  path,
  { method = "GET", data, cookie = owner, body } = {},
) {
  return fetch(base + "/api" + path, {
    method,
    headers: {
      Cookie: cookie,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : body,
  });
}
const templates = await (await request("/templates")).json();
assert.equal(templates.length, 6);
assert.equal((await request("/templates/missing")).status, 404);
assert.equal((await request("/tasks", { cookie: "" })).status, 401);
assert.equal((await request("/tasks?page=not-a-number")).status, 400);
assert.equal((await request("/not-a-route")).status, 404);
assert.equal(
  (await request("/assets", { method: "POST", body: new FormData() })).status,
  400,
);
const png = await (await request("/templates/travel-postcard/cover")).blob();
const form = new FormData();
form.append("file", png, "sample.png");
const upload = await request("/assets", { method: "POST", body: form });
assert.equal(upload.status, 201);
const asset = await upload.json();
assert.equal(asset.storageKey, undefined);
assert.equal(asset.ownerId, undefined);
const tooBig = new FormData();
tooBig.append(
  "file",
  new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" }),
  "large.png",
);
assert.equal(
  (await request("/assets", { method: "POST", body: tooBig })).status,
  413,
);
const corrupt = new FormData();
corrupt.append(
  "file",
  new Blob(
    [
      new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      ]),
    ],
    { type: "image/png" },
  ),
  "truncated.png",
);
assert.equal(
  (await request("/assets", { method: "POST", body: corrupt })).status,
  415,
);
assert.equal(
  (await request(`/assets/${asset.id}/content`, { cookie: other })).status,
  404,
);
const malformed = new FormData();
malformed.append(
  "file",
  new Blob(["not a png"], { type: "image/png" }),
  "fake.png",
);
assert.equal(
  (await request("/assets", { method: "POST", body: malformed })).status,
  415,
);
assert.equal(
  (
    await request("/tasks", {
      method: "POST",
      data: { templateId: "pet-card", assetIds: [asset.id] },
    })
  ).status,
  422,
);
assert.equal(
  (
    await request("/tasks", {
      method: "POST",
      cookie: other,
      data: { templateId: "travel-postcard", assetIds: [asset.id] },
    })
  ).status,
  422,
);
async function create(failAt = "NONE", delayMs = 200) {
  const start = Date.now();
  const r = await request("/tasks", {
    method: "POST",
    data: {
      templateId: "travel-postcard",
      assetIds: [asset.id],
      simulation: { failAt, delayMs },
    },
  });
  assert.equal(r.status, 202);
  return { task: await r.json(), elapsed: Date.now() - start };
}
const slow = await create("NONE", 1200);
assert.ok(slow.elapsed < 3000, "submit must not wait for 3600ms pipeline");
assert.ok(["QUEUED", "RUNNING"].includes(slow.task.status));
const failures = await Promise.all(
  ["CHECK_ASSETS", "GENERATE", "PACKAGE_RESULT"].map((stage) => create(stage)),
);
async function finish(id) {
  for (let i = 0; i < 80; i++) {
    const r = await request("/tasks/" + id);
    assert.equal(r.status, 200);
    const result = await r.json();
    if (["SUCCEEDED", "FAILED"].includes(result.task.status)) return result;
    await pause(250);
  }
  throw new Error("Task timed out");
}
const success = await finish(slow.task.id);
assert.equal(success.task.resultStorageKey, undefined);
assert.equal(success.task.status, "SUCCEEDED");
assert.deepEqual(
  success.stages.map((s) => s.status),
  ["SUCCEEDED", "SUCCEEDED", "SUCCEEDED"],
);
for (let i = 0; i < failures.length; i++) {
  const r = await finish(failures[i].task.id);
  assert.equal(r.task.status, "FAILED");
  assert.equal(
    r.task.failedStage,
    ["CHECK_ASSETS", "GENERATE", "PACKAGE_RESULT"][i],
  );
  assert.equal(r.stages[i].status, "FAILED");
  assert.ok(r.stages.slice(i + 1).every((s) => s.status === "SKIPPED"));
}
assert.equal((await request(`/tasks/${success.task.id}/result`)).status, 200);
assert.equal(
  (await request(`/tasks/${success.task.id}`, { cookie: other })).status,
  404,
);
assert.equal(
  (await request(`/tasks/${success.task.id}/result`, { cookie: other })).status,
  404,
);
const history = await (await request("/tasks")).json();
assert.ok(history.items.some((t) => t.id === success.task.id));
const restored = await (await request("/tasks/" + success.task.id)).json();
assert.equal(restored.task.status, "SUCCEEDED");
const otherHistory = await (await request("/tasks", { cookie: other })).json();
assert.equal(otherHistory.items.length, 0);
console.log(
  "PASS: 6 templates, valid/invalid uploads, asynchronous success, three failure boundaries, skipped downstream steps, private assets/results, persistent history and terminal stability.",
);
