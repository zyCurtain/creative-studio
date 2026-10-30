import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL ?? "http://backend:8080";
const phase = process.argv[2];
async function call(path, cookie, body) {
  const r = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
}
async function until(id, cookie, predicate) {
  for (let i = 0; i < 100; i++) {
    const v = await call("/tasks/" + id, cookie);
    if (predicate(v.task)) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Task state timeout");
}
if (phase === "prepare") {
  const session = await fetch(base + "/api/session", { method: "POST" });
  const cookie = session.headers.get("set-cookie").split(";")[0];
  const form = new FormData();
  form.append(
    "file",
    await (await fetch(base + "/api/templates/travel-postcard/cover")).blob(),
    "test.png",
  );
  const asset = await (
    await fetch(base + "/api/assets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    })
  ).json();
  const create = (delayMs) =>
    call("/tasks", cookie, {
      templateId: "travel-postcard",
      assetIds: [asset.id],
      simulation: { failAt: "NONE", delayMs },
    });
  const successful = await create(0);
  await until(successful.id, cookie, (t) => t.status === "SUCCEEDED");
  const running = await create(60000);
  await until(running.id, cookie, (t) => t.status === "RUNNING");
  const queued1 = await create(60000),
    queued2 = await create(60000),
    rejected = await create(60000);
  assert.equal(queued1.status, "QUEUED");
  assert.equal(queued2.status, "QUEUED");
  assert.equal(rejected.status, "FAILED");
  assert.equal(rejected.errorCode, "EXECUTOR_REJECTED");
  assert.equal(rejected.failedStage, null);
  const rejection = await call("/tasks/" + rejected.id, cookie);
  assert.ok(rejection.stages.every((s) => s.status === "SKIPPED"));
  await writeFile(
    "/state/fixtures.json",
    JSON.stringify({
      cookie,
      successful: successful.id,
      unfinished: [running.id, queued1.id, queued2.id],
      rejected: rejected.id,
    }),
    { mode: 0o600 },
  );
  console.log(
    "PASS: bounded queue rejects promptly, records failure, skips all steps; fixtures ready for isolated process kill.",
  );
} else if (phase === "check") {
  const state = JSON.parse(await readFile("/state/fixtures.json", "utf8"));
  for (const id of state.unfinished) {
    const r = await call("/tasks/" + id, state.cookie);
    assert.equal(r.task.status, "FAILED");
    assert.equal(r.task.errorCode, "EXECUTION_INTERRUPTED");
    assert.ok(r.stages.every((s) => ["FAILED", "SKIPPED"].includes(s.status)));
  }
  const success = await call("/tasks/" + state.successful, state.cookie);
  assert.equal(success.task.status, "SUCCEEDED");
  assert.equal(
    (
      await fetch(base + "/api/tasks/" + state.successful + "/result", {
        headers: { Cookie: state.cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/tasks/" + state.rejected, state.cookie)).task.errorCode,
    "EXECUTOR_REJECTED",
  );
  assert.deepEqual(await call("/tasks/active", state.cookie), []);
  console.log(
    "PASS: restart closes running/queued jobs, preserves completed results and existing failures, and leaves no active jobs.",
  );
} else throw new Error("Use prepare or check");
