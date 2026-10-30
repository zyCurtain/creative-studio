"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, post, Task, Template } from "@/lib/api";
import { useSession } from "./session";
import { useTasks } from "@/lib/use-tasks";
import { TaskList } from "./task-list";
import { useUploads } from "@/lib/use-uploads";
import { SafeImage } from "./safe-image";
import { CoverCredit } from "./cover-credit";
export function Workspace({ id }: { id: string }) {
  const owner = useSession();
  const [template, setTemplate] = useState<Template | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const a = new AbortController();
    api<Template>(`/templates/${encodeURIComponent(id)}`, { signal: a.signal })
      .then(setTemplate)
      .catch((e) => {
        if (!a.signal.aborted) setError(e.message);
      });
    return () => a.abort();
  }, [id, attempt]);
  if (error)
    return (
      <main className="page empty">
        <h2>{error}</h2>
        <button
          onClick={() => {
            setError("");
            setAttempt((x) => x + 1);
          }}
        >
          重试
        </button>
        <Link href="/">返回模板广场</Link>
      </main>
    );
  if (!template || !owner)
    return <main className="page empty">正在准备你的创作空间…</main>;
  return <Studio key={owner + id} template={template} owner={owner} />;
}
function Studio({ template, owner }: { template: Template; owner: string }) {
  const state = useTasks(owner, template.id);
  const { slots, upload, remove } = useUploads(template);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const submitLock = useRef(false);
  const [generation, setGeneration] = useState<{mode:string;model:string}|null>(null);
  const [configError, setConfigError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<{mode:string;model:string}>("/generation/config",{signal:controller.signal}).then(setGeneration).catch(()=>{
      if (!controller.signal.aborted) setConfigError(true);
    });
    return () => controller.abort();
  }, []);
  const submitAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      submitAbort.current?.abort();
    };
  }, []);
  async function submit() {
    if (submitLock.current || slots.some((s) => s.status !== "ready")) return;
    submitLock.current = true;
    setSubmitting(true);
    setMessage("");
    const controller = new AbortController();
    submitAbort.current = controller;
    try {
      const task = await post<Task>(
        "/tasks",
        { templateId: template.id, assetIds: slots.map((s) => s.asset!.id) },
        controller.signal,
      );
      state.add(task);
      setMessage("任务已受理，你可以继续制作其他作品。");
    } catch (e) {
      if (!controller.signal.aborted)
        setMessage(
          `${e instanceof Error ? e.message : "提交异常"}。如果请求超时，请先刷新制作记录确认是否已受理。`,
        );
    } finally {
      submitLock.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }
  return (
    <main className="workspace">
      <aside className="editor">
        <Link className="back" href="/">
          ← 返回模板广场
        </Link>
        <div className="editor-title">
          <small>{template.category}</small>
          <h1>{template.title}</h1>
        </div>
        <SafeImage
          className="editor-cover"
          src={template.coverUrl}
          alt={template.title}
        />
        <CoverCredit template={template}/>
        {template.custom&&<details className="template-prompt"><summary>我的生成提示词</summary><p>{template.prompt}</p></details>}
        <p className="description">{template.description}</p>
        <div className="upload-title">
          <h2>添加你的照片</h2>
          <span>{template.requiredImageCount} 张图片</span>
        </div>
        <p className="upload-hint">JPEG / PNG · 每张不超过 5 MiB</p>
        <div className={`upload-grid slots-${slots.length}`}>
          {slots.map((slot, i) => (
            <div className={`upload-slot ${slot.status}`} key={i}>
              {slot.asset && (
                <SafeImage
                  src={slot.asset.previewUrl}
                  alt={`已上传图片 ${i + 1}`}
                />
              )}
              <label className="upload-label">
                <input
                  aria-label={`选择图片 ${i + 1}`}
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={submitting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(i, f);
                    e.target.value = "";
                  }}
                />
                <span>
                  {slot.status === "ready" ? (
                    "替换图片"
                  ) : slot.status === "uploading" ? (
                    "上传中…"
                  ) : (
                    <>
                      <b>＋</b>选择图片 {slots.length > 1 ? i + 1 : ""}
                    </>
                  )}
                </span>
              </label>
              {slot.status !== "empty" && (
                <button
                  className="remove"
                  disabled={submitting}
                  aria-label={`移除图片 ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              )}
              {slot.error && <small role="alert">{slot.error}</small>}
            </div>
          ))}
        </div>
        <button
          className="primary create"
          disabled={!generation || submitting || slots.some((s) => s.status !== "ready")}
          onClick={() => void submit()}
        >
          {submitting ? (
            "正在提交…"
          ) : (
            <>
              开始制作 <span>✦</span>
            </>
          )}
        </button>
        <p className="submission-note" role="status">
          {message || "任务在后台执行，你可以放心离开页面。"}
        </p>
        <div className="demo-label">{generation?.mode === "BAILIAN" ? `◇ 百炼真实生成 · ${generation.model} · 按账户计费` : generation ? "◇ 模拟制作 · 不调用外部模型" : configError ? "生成配置读取失败，请刷新页面" : "正在读取生成配置…"}</div>
        <p className="upload-hint">模板封面仅为风格示意。{generation?.mode === "BAILIAN" && "开始制作后，所选图片将发送至阿里云百炼进行处理。"}</p>
      </aside>
      <section className="history-panel">
        <TaskList state={state} />
      </section>
    </main>
  );
}
export function History() {
  const owner = useSession();
  const state = useTasks(owner);
  return (
    <main className="page history-page">
      <div className="page-heading">
        <span className="eyebrow">A COLLECTION OF YOUR IDEAS</span>
        <h1>每一份灵感，都有迹可循。</h1>
        <p>所有模板的制作记录，都保存在这里。</p>
      </div>
      <TaskList state={state} />
    </main>
  );
}
