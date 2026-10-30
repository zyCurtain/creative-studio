// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountDialog, type Identity } from "./account-dialog";
import { post } from "../lib/api";
vi.mock("../lib/api", () => ({ post: vi.fn() }));
const guest: Identity = {
  id: "guest",
  displayName: "访客",
  registered: false,
  email: null,
  pendingGuest: false,
  pendingTasks: 0,
  pendingAssets: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(cleanup);
it("rejects mismatched confirmation without sending registration", () => {
  render(<AccountDialog identity={guest} close={vi.fn()} changed={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "注册账户" }));
  fireEvent.change(screen.getByLabelText("密码", { exact: true }), {
    target: { value: "test-password" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "different-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "注册并保存当前作品" }).closest("form")!,
  );
  expect(screen.getByRole("alert").textContent).toContain("不一致");
  expect(post).not.toHaveBeenCalled();
});
it("keeps failed login in place and prevents duplicate in-flight submission", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(post).mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const changed = vi.fn();
  render(<AccountDialog identity={guest} close={vi.fn()} changed={changed} />);
  fireEvent.change(screen.getByLabelText("邮箱"), {
    target: { value: "qa@example.test" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "test-password" },
  });
  const form = screen
    .getByRole("button", { name: "登录账户" })
    .closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(post).toHaveBeenCalledTimes(1);
  reject(new Error("邮箱或密码不正确"));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("邮箱或密码不正确"),
  );
  expect(changed).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "登录账户" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("binds only after explicit action and publishes the new identity", async () => {
  const account = {
    ...guest,
    id: "account",
    registered: true,
    email: "qa@example.test",
    pendingGuest: true,
    pendingTasks: 2,
    pendingAssets: 3,
  };
  const merged = {
    ...account,
    pendingGuest: false,
    pendingTasks: 0,
    pendingAssets: 0,
  };
  vi.mocked(post).mockResolvedValue(merged);
  const changed = vi.fn();
  render(
    <AccountDialog identity={account} close={vi.fn()} changed={changed} />,
  );
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "绑定访客作品" }));
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith(merged, "访客作品已绑定到账户"),
  );
  expect(post).toHaveBeenCalledWith("/auth/bind", {});
});
