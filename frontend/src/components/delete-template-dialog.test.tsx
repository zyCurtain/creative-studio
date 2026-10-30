// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeleteTemplateDialog } from "./delete-template-dialog";
import { ApiError, post, Template } from "../lib/api";
vi.mock("../lib/api",async importOriginal=>({...await importOriginal<typeof import("../lib/api")>(),post:vi.fn()}));
const template={id:"personal",title:"周末日记"} as Template;
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};});
afterEach(cleanup);
it("cancel sends no delete; pending confirmation is locked and failure stays recoverable",async()=>{
  const close=vi.fn(),deleted=vi.fn();
  let reject!:(error:Error)=>void;
  vi.mocked(post).mockReturnValue(new Promise((_,fail)=>{reject=fail;}));
  render(<DeleteTemplateDialog template={template} close={close} deleted={deleted}/>);
  fireEvent.click(screen.getByRole("button",{name:"取消"}));
  expect(close).toHaveBeenCalledOnce();expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"确认删除模板"}));
  fireEvent.click(screen.getByRole("button",{name:"正在删除…"}));
  expect(post).toHaveBeenCalledOnce();expect(deleted).not.toHaveBeenCalled();
  reject(new Error("服务暂不可用"));
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("服务暂不可用"));
  expect(deleted).not.toHaveBeenCalled();
  vi.mocked(post).mockResolvedValue({deleted:true});
  fireEvent.click(screen.getByRole("button",{name:"确认删除模板"}));
  await waitFor(()=>expect(deleted).toHaveBeenCalledOnce());
});
it("removes stale card if a second tab has already deleted it",async()=>{
  vi.mocked(post).mockRejectedValue(new ApiError("模板已删除",404));
  const deleted=vi.fn();
  render(<DeleteTemplateDialog template={template} close={vi.fn()} deleted={deleted}/>);
  fireEvent.click(screen.getByRole("button",{name:"确认删除模板"}));
  await waitFor(()=>expect(deleted).toHaveBeenCalledOnce());
});
