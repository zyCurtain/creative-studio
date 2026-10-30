// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SafeImage } from "./safe-image";
afterEach(cleanup);
it("shows an understandable failure and tries a replacement source", () => {
  const { rerender } = render(<SafeImage src="/old" alt="作品" />);
  fireEvent.error(screen.getByRole("img", { name: "作品" }));
  expect(screen.getByRole("img", { name: "作品暂不可用" })).toBeTruthy();
  rerender(<SafeImage src="/new" alt="作品" />);
  expect(screen.getByRole("img", { name: "作品" }).getAttribute("src")).toBe(
    "/new",
  );
});
