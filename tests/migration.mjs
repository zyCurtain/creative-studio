// Optional V1 -> V2 upgrade probe. Mount a private scratch directory at /state.
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
const base = process.env.BASE_URL ?? "http://frontend:3000";
if (process.argv[2] === "prepare") {
  const response = await fetch(`${base}/api/session`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const identity = await response.json();
  const png = await (
    await fetch(`${base}/api/templates/travel-postcard/cover`)
  ).blob();
  const form = new FormData();
  form.append("file", png, "migration.png");
  const asset = await (
    await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    })
  ).json();
  const task = await (
    await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "travel-postcard",
        assetIds: [asset.id],
        simulation: { delayMs: 0 },
      }),
    })
  ).json();
  assert.ok(task.id);
  await writeFile(
    "/state/migration-probe.json",
    JSON.stringify({ cookie, identity, asset, task }),
    { mode: 0o600 },
  );
  console.log("Migration probe saved privately; no tokens printed.");
} else {
  const { cookie, identity, asset, task } = JSON.parse(
    await readFile("/state/migration-probe.json", "utf8"),
  );
  const headers = { Cookie: cookie };
  const response = await fetch(`${base}/api/session`, {
    method: "POST",
    headers,
  });
  assert.equal((await response.json()).id, identity.id);
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    "old session remains valid",
  );
  for (const path of [
    `/assets/${asset.id}/content`,
    `/tasks/${task.id}`,
    `/tasks/${task.id}/result`,
  ]) {
    assert.equal(
      (await fetch(`${base}/api${path}`, { headers })).status,
      200,
      path,
    );
  }
  await unlink("/state/migration-probe.json");
  console.log(
    "PASS migration: V1 guest cookie, owner, upload, task and result survived V2.",
  );
}
