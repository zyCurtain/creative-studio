// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { Shell, useSession } from "./session";
import type { Identity } from "./account-dialog";
const { guest, account } = vi.hoisted(() => ({
  guest: {
    id: "guest",
    displayName: "访客",
    registered: false,
    email: null,
    pendingGuest: false,
    pendingTasks: 0,
    pendingAssets: 0,
  },
  account: {
    id: "account",
    displayName: "用户",
    registered: true,
    email: "qa@example.test",
    pendingGuest: false,
    pendingTasks: 0,
    pendingAssets: 0,
  },
}));
vi.mock("../lib/api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("./account-dialog", () => ({
  AccountDialog: ({
    changed,
  }: {
    changed: (value: Identity, notice: string) => void;
  }) => (
    <button onClick={() => changed(account, "登录成功")}>完成测试登录</button>
  ),
}));
class Channel {
  static instances = new Set<Channel>();
  onmessage: (() => void) | null = null;
  constructor() {
    Channel.instances.add(this);
  }
  postMessage() {
    for (const channel of Channel.instances)
      if (channel !== this) channel.onmessage?.();
  }
  close() {
    Channel.instances.delete(this);
  }
}
function Content() {
  return <p>记录归属：{useSession()}</p>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("BroadcastChannel", Channel);
  vi.mocked(api).mockResolvedValue(guest);
});
afterEach(() => {
  cleanup();
  Channel.instances.clear();
  vi.unstubAllGlobals();
});
it("keeps the local login result without treating its own broadcast as a remote change", async () => {
  render(
    <Shell>
      <Content />
    </Shell>,
  );
  await screen.findByText("记录归属：guest");
  fireEvent.click(screen.getByRole("button", { name: "登录 / 注册" }));
  fireEvent.click(screen.getByRole("button", { name: "完成测试登录" }));
  await waitFor(() =>
    expect(screen.getByText("记录归属：account")).toBeTruthy(),
  );
  expect(screen.getByRole("status").textContent).toContain("登录成功");
  expect(api).toHaveBeenCalledTimes(1);
});
it("hides old records immediately when another tab switches identity", async () => {
  let resolve!: (value: Identity) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(guest)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
  render(
    <Shell>
      <Content />
    </Shell>,
  );
  await screen.findByText("记录归属：guest");
  const other = new Channel();
  act(() => other.postMessage());
  expect(screen.queryByText("记录归属：guest")).toBeNull();
  await act(async () => resolve(account));
  expect(screen.getByText("记录归属：account")).toBeTruthy();
});
