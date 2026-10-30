import { describe, it, expect } from "vitest";
import { mergeTasks, active, Task } from "./api";
const make = (id: string, status: Task["status"], version: number): Task => ({
  id,
  status,
  version,
  templateId: "t",
  templateTitle: "T",
  currentStage: null,
  failedStage: null,
  errorMessage: null,
  resultUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
});
describe("task snapshot reconciliation", () => {
  it("keeps simultaneous tasks independent", () => {
    const items = mergeTasks(
      [make("a", "RUNNING", 1), make("b", "RUNNING", 1)],
      [make("a", "SUCCEEDED", 2)],
    );
    expect(items.find((t) => t.id === "b")?.status).toBe("RUNNING");
    expect(items.find((t) => t.id === "a")?.status).toBe("SUCCEEDED");
  });
  it("rejects a late running snapshot after success", () => {
    expect(
      mergeTasks([make("a", "SUCCEEDED", 4)], [make("a", "RUNNING", 2)])[0]
        .status,
    ).toBe("SUCCEEDED");
  });
  it("tracks only unfinished work", () => {
    expect(
      [
        make("a", "QUEUED", 1),
        make("b", "RUNNING", 1),
        make("c", "SUCCEEDED", 2),
        make("d", "FAILED", 2),
      ]
        .filter(active)
        .map((t) => t.id),
    ).toEqual(["a", "b"]);
  });
});
