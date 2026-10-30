// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUploads } from "./use-uploads";
import type { Template } from "./api";
const template: Template = {
  id: "t",
  title: "T",
  category: "C",
  description: "",
  requiredImageCount: 2,
  coverUrl: "/cover",
  acceptedMimeTypes: ["image/png"],
  maxFileSizeBytes: 10,
};
const file = () => new File(["png"], "input.png", { type: "image/png" });
const response = (id: string) =>
  new Response(JSON.stringify({ id, previewUrl: `/${id}` }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("upload request isolation", () => {
  it("ignores late replaced and removed uploads without disturbing another slot", async () => {
    const resolves: ((value: Response) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => resolves.push(r))),
    );
    const { result } = renderHook(() => useUploads(template));
    act(() => {
      void result.current.upload(0, file());
      void result.current.upload(1, file());
    });
    act(() => {
      void result.current.upload(0, file());
    });
    await act(async () => {
      resolves[2](response("new"));
      resolves[0](response("old"));
      resolves[1](response("other"));
    });
    expect(result.current.slots.map((s) => s.asset?.id)).toEqual([
      "new",
      "other",
    ]);
    act(() => {
      void result.current.upload(0, file());
      result.current.remove(0);
    });
    await act(async () => {
      resolves[3](response("removed"));
    });
    expect(result.current.slots[0].status).toBe("empty");
    expect(result.current.slots[1].asset?.id).toBe("other");
  });
  it("rejects oversized and empty inputs before networking", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useUploads(template));
    await act(async () => {
      await result.current.upload(
        0,
        new File(["x".repeat(11)], "big.png", { type: "image/png" }),
      );
      await result.current.upload(
        1,
        new File([], "empty.png", { type: "image/png" }),
      );
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.slots.every((s) => s.status === "error")).toBe(true);
  });
  it("aborts requests when the upload area unmounts", () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal!;
        return new Promise(() => {});
      }),
    );
    const { result, unmount } = renderHook(() => useUploads(template));
    act(() => {
      void result.current.upload(0, file());
    });
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
