"use client";
import { useEffect, useRef, useState } from "react";
import { Template, post } from "@/lib/api";
import { useUploads } from "@/lib/use-uploads";
import { SafeImage } from "./safe-image";

const coverRule: Template = { id:"cover", title:"封面", category:"", description:"", requiredImageCount:1, coverUrl:"", maxFileSizeBytes:5242880, acceptedMimeTypes:["image/jpeg","image/png"] };

export function NewTemplateDialog({close,created}:{close:()=>void;created:(template:Template)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const lock=useRef(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const {slots,upload,remove}=useUploads(coverRule);
  const cover=slots[0];
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="account-dialog template-dialog" aria-labelledby="new-template-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
    <div className="account-heading"><span className="eyebrow">MAKE IT YOURS</span><button type="button" disabled={busy} onClick={close} aria-label="关闭新建模板">✕</button></div>
    <h2 id="new-template-title">新建模板</h2>
    <p className="account-copy">把喜欢的风格变成可重复使用的模板。保存到你的账户，仅自己可见。</p>
    <form onSubmit={async e=>{
      e.preventDefault(); if(lock.current || cover.status!=="ready")return;
      const form=new FormData(e.currentTarget);
      lock.current=true;setBusy(true);setError("");
      try {
        const template=await post<Template>("/templates",{title:String(form.get("title")).trim(),description:String(form.get("description")).trim(),prompt:String(form.get("prompt")).trim(),requiredImageCount:Number(form.get("count")),coverAssetId:cover.asset!.id});
        created(template);
      } catch(e) {setError(e instanceof Error?e.message:"创建失败，请重试");}
      finally {lock.current=false;setBusy(false);}
    }}>
      <fieldset disabled={busy}>
        <label>模板名称<input name="title" required maxLength={80} placeholder="例如：周末胶片日记" /></label>
        <label>一句话介绍<input name="description" required maxLength={400} placeholder="温暖的胶片色调，记录日常的小确幸" /></label>
        <label>需要上传几张照片<select name="count" defaultValue="1"><option value="1">1 张 · 单图创作</option><option value="2">2 张 · 双图创作</option></select></label>
        <label>生成提示词<textarea name="prompt" rows={4} required maxLength={1000} placeholder="描述你希望生成的画面、色调和构图。例如：保留照片主体，使用暖色胶片风格，加入细腻颗粒与简洁留白。" /></label>
        <p className="field-help">最多 1000 字；作品固定为竖版 3:4。封面仅作展示，创作时使用另外上传的照片和这段提示词。</p>
        <label>模板封面<input aria-label="模板封面" type="file" accept="image/jpeg,image/png" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(0,file);e.target.value="";}} /></label>
        <p className="field-help">JPEG / PNG，单张不超过 5 MiB。请选择你有权使用的图片。</p>
        {cover.status==="uploading"&&<p role="status">封面上传中…</p>}
        {cover.error&&<p className="error" role="alert">{cover.error}</p>}
        {cover.asset&&<div className="new-cover-preview"><SafeImage src={cover.asset.previewUrl} alt="模板封面预览"/><button type="button" onClick={()=>remove(0)}>移除封面</button></div>}
      </fieldset>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="template-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary" type="submit" disabled={busy||cover.status!=="ready"}>{busy?"正在保存…":"创建我的模板"}</button></div>
    </form>
  </dialog>;
}
