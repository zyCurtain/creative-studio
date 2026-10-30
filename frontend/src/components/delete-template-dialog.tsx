"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, post, Template } from "../lib/api";

export function DeleteTemplateDialog({template,close,deleted}:{template:Template;close:()=>void;deleted:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const locked=useRef(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function confirm() {
    if(locked.current)return;
    locked.current=true;setBusy(true);setError("");
    try {
      await post(`/templates/${encodeURIComponent(template.id)}/delete`,{});
      deleted();
    } catch(e) {
      // Another tab may already have deleted the same template.
      if(e instanceof ApiError && e.status===404)deleted();
      else setError(e instanceof Error?e.message:"删除失败，请重试");
    } finally {locked.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="account-dialog" aria-labelledby="delete-template-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
    <h2 id="delete-template-title">删除这个模板？</h2>
    <p className="account-copy">「{template.title}」将从你的模板列表移除，之后无法再用它创建作品。删除后无法在页面恢复。</p>
    <p className="account-copy">已生成的作品和历史记录会保留，正在制作的任务也会继续完成。</p>
    {error&&<p className="account-error" role="alert">{error}</p>}
    <div className="delete-actions"><button disabled={busy} onClick={close}>取消</button><button className="delete-confirm" disabled={busy} onClick={()=>void confirm()}>{busy?"正在删除…":"确认删除模板"}</button></div>
  </dialog>;
}
