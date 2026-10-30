// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTasks } from "./use-tasks";
import { Task } from "./api";
const task = (
  id: string,
  status: Task["status"] = "RUNNING",
  version = 1,
): Task => ({
  id,
  status,
  version,
  templateId: "t",
  templateTitle: "T",
  currentStage: "GENERATE",
  failedStage: null,
  errorMessage: null,
  resultUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("query lifecycle", () => {
  it("shows refresh progress, replaces stale history and preserves records on failure", async () => {
    let resolveHistory!: (value: Response) => void;
    let historyCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/active")) return Promise.resolve(response([]));
      historyCalls++;
      if (historyCalls === 1) return Promise.resolve(response({items:[task("old", "SUCCEEDED")],hasMore:false}));
      return new Promise<Response>((resolve) => { resolveHistory = resolve; });
    }));
    const {result} = renderHook(() => useTasks("owner"));
    await act(async () => {});
    act(() => result.current.retry());
    expect(result.current.refreshing).toBe(true);
    expect(result.current.tasks[0].id).toBe("old");
    await act(async () => resolveHistory(response({items:[task("new", "SUCCEEDED")],hasMore:false})));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.tasks.map(t=>t.id)).toEqual(["new"]);
    expect(result.current.refreshedAt).not.toBe("");
    act(() => result.current.retry());
    await act(async () => resolveHistory(response({message:"offline"},503)));
    expect(result.current.tasks[0].id).toBe("new");
    expect(result.current.error).toBe("offline");
    expect(result.current.refreshing).toBe(false);
  });
  it("removes only the confirmed record and retains it when deletion fails", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(
      url.endsWith("/delete") ? response(fail ? {message:"delete failed"} : {deleted:true},fail ? 503 : 200)
      : url.includes("/active") ? response([]) : response({items:[task("one","SUCCEEDED"),task("two","FAILED")],hasMore:false})
    )));
    const {result} = renderHook(() => useTasks("owner"));
    await act(async () => {});
    await act(async () => { await expect(result.current.remove("one")).rejects.toThrow("delete failed"); });
    expect(result.current.tasks).toHaveLength(2);
    fail = false;
    await act(async () => result.current.remove("one"));
    expect(result.current.tasks.map(t=>t.id)).toEqual(["two"]);
  });
  it("clears rendered old-user data immediately and ignores a late pagination failure", async () => {
    let rejectMore: (e: Error) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("page=1"))
          return new Promise<Response>((_r, j) => {
            rejectMore = j;
          });
        return Promise.resolve(
          url.includes("/active")
            ? response([])
            : response({ items: [task("old", "SUCCEEDED", 2)], hasMore: true }),
        );
      }),
    );
    const { result, rerender } = renderHook(({ owner }) => useTasks(owner), {
      initialProps: { owner: "old" },
    });
    await act(async () => {});
    act(() => {
      void result.current.more();
    });
    rerender({ owner: "new" });
    expect(result.current.tasks).toEqual([]);
    await act(async () => {
      rejectMore(new Error("old pagination failure"));
    });
    expect(result.current.moreError).toBe("");
  });
  it("deduplicates load-more requests and allows recovery from pagination errors", async () => {
    let resolveMore: (r: Response) => void = () => {};
    let pageRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("page=1")) {
          pageRequests++;
          return pageRequests === 1
            ? new Promise<Response>((r) => {
                resolveMore = r;
              })
            : Promise.resolve(
                response({
                  items: [task("older", "SUCCEEDED", 2)],
                  hasMore: false,
                }),
              );
        }
        return Promise.resolve(
          url.includes("/active")
            ? response([])
            : response({
                items: [task("latest", "SUCCEEDED", 2)],
                hasMore: true,
              }),
        );
      }),
    );
    const { result } = renderHook(() => useTasks("visitor"));
    await act(async () => {});
    act(() => {
      void result.current.more();
      void result.current.more();
    });
    expect(pageRequests).toBe(1);
    expect(result.current.loadingMore).toBe(true);
    await act(async () => {
      resolveMore(response({ message: "temporary" }, 503));
    });
    expect(result.current.moreError).toBe("temporary");
    expect(result.current.tasks).toHaveLength(1);
    await act(async () => {
      await result.current.more();
    });
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.moreError).toBe("");
  });
  it("recovers pending tasks that are absent from the first history page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/active")
          ? response([task("old-pending")])
          : url.includes("status-query")
            ? response([task("old-pending", "SUCCEEDED", 2)])
            : response({
                items: [task("recent", "SUCCEEDED", 2)],
                hasMore: true,
              }),
      ),
    );
    const { result } = renderHook(() => useTasks("visitor"));
    await act(async () => {});
    expect(result.current.tasks).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      result.current.tasks.find((t) => t.id === "old-pending")?.status,
    ).toBe("SUCCEEDED");
  });
  it("does not overlap a slow polling request when another task is created", async () => {
    let resolvePoll: (r: Response) => void = () => {};
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("status-query")
          ? (polls++,
            new Promise<Response>((r) => {
              resolvePoll = r;
            }))
          : Promise.resolve(
              url.includes("/active")
                ? response([task("a")])
                : response({ items: [task("a")], hasMore: false }),
            ),
      ),
    );
    const { result } = renderHook(() => useTasks("visitor"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    act(() => result.current.add(task("b")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(polls).toBe(1);
    await act(async () => {
      resolvePoll(response([task("a", "SUCCEEDED", 2)]));
    });
    expect(result.current.tasks.find((t) => t.id === "b")?.status).toBe(
      "RUNNING",
    );
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("preserves backend state on network failure, recovers and stops when done", async () => {
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("status-query")) {
          polls++;
          return polls === 1
            ? response({ message: "temporary" }, 503)
            : response([task("a", "SUCCEEDED", 2), task("b", "FAILED", 2)]);
        }
        if (url.includes("/active")) return response([task("a"), task("b")]);
        return response({ items: [task("a"), task("b")], hasMore: false });
      }),
    );
    const { result } = renderHook(() => useTasks("visitor"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.error).toBe("temporary");
    expect(result.current.tasks.every((t) => t.status === "RUNNING")).toBe(
      true,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.tasks.find((t) => t.id === "a")?.status).toBe(
      "SUCCEEDED",
    );
    expect(result.current.tasks.find((t) => t.id === "b")?.status).toBe(
      "FAILED",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(polls).toBe(2);
  });
  it("does not let a late old-user response overwrite the new user", async () => {
    let resolveOld: (r: Response) => void = () => {};
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls++;
        if (calls <= 2) {
          if (url.includes("/active")) return Promise.resolve(response([]));
          return new Promise<Response>((r) => {
            resolveOld = r;
          });
        }
        return Promise.resolve(
          url.includes("/active")
            ? response([])
            : response({
                items: [task("new", "SUCCEEDED", 2)],
                hasMore: false,
              }),
        );
      }),
    );
    const { result, rerender } = renderHook(({ owner }) => useTasks(owner), {
      initialProps: { owner: "old" },
    });
    rerender({ owner: "new" });
    await act(async () => {});
    await act(async () =>
      resolveOld(response({ items: [task("old")], hasMore: false })),
    );
    expect(result.current.tasks.map((t) => t.id)).toEqual(["new"]);
  });
  it("cancels pending work and timers on unmount", async () => {
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("status-query")) polls++;
        return url.includes("/active")
          ? response([task("a")])
          : response({ items: [task("a")], hasMore: false });
      }),
    );
    const { unmount } = renderHook(() => useTasks("visitor"));
    await act(async () => {});
    unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(polls).toBe(0);
  });
});
