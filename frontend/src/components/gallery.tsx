"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SafeImage } from "./safe-image";
import { api, Template } from "@/lib/api";
import { useAccount } from "./session";
import { NewTemplateDialog } from "./new-template-dialog";
import { CoverCredit } from "./cover-credit";
import { DeleteTemplateDialog } from "./delete-template-dialog";
export function Gallery() {
  const {identity,openAccount}=useAccount();
  const [creating,setCreating]=useState(false);
  const [deleting,setDeleting]=useState<Template|null>(null);
  const [notice,setNotice]=useState("");
  function newTemplate() {
    if (!identity?.registered) {setNotice("登录或注册后，即可创建并保存自己的模板。");openAccount();return;}
    setCreating(true);
  }
  const [templates, setTemplates] = useState<Template[]>([]);
  const params = useSearchParams();
  const category = params.get("category") || "全部";
  function setCategory(value: string) {
    const url = new URL(window.location.href);
    if (value === "全部") url.searchParams.delete("category");
    else url.searchParams.set("category", value);
    window.history.pushState(null, "", url);
  }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api<Template[]>("/templates", { signal: abort.signal })
      .then(setTemplates)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [attempt]);
  const categories = ["全部", ...new Set([...templates.map((t) => t.category),...(identity?.registered?["我的模板"]:[])])];
  const shown = templates.filter(
    (t) => category === "全部" || t.category === category,
  );
  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">
            <span /> EVERYDAY, A LITTLE CREATIVE
          </div>
          <h1>
            给平常的照片，
            <br />
            一点<span>不平常的灵感。</span>
          </h1>
          <p>选一个喜欢的模板，上传你的照片。剩下的，交给工坊。</p>
        </div>
        <div className="hero-note">
          <span>✳</span>
          <p>
            记录日常
            <br />
            也创造惊喜
          </p>
          <small>MAKE SOMETHING YOURS</small>
        </div>
      </section>
      <div className="gallery-toolbar">
        <div className="tabs" aria-label="模板分类">
          {categories.map((c) => (
            <button
              key={c}
              className={c === category ? "active" : ""}
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="gallery-actions"><span className="muted">{shown.length} 个灵感模板</span><button className="primary" onClick={newTemplate}>＋ 新建模板</button></div>
      </div>
      {notice&&<p className="notice" role="status">{notice}</p>}
      {loading ? (
        <div className="empty">正在发现灵感…</div>
      ) : error ? (
        <div className="notice">
          {error}
          <button
            onClick={() => {
              setError("");
              setAttempt((x) => x + 1);
            }}
          >
            重新加载
          </button>
        </div>
      ) : (
        <div className="gallery">
          {shown.map((t, i) => (
            <article key={t.id}>
            <Link
              className="template-card"
              href={`/templates/${t.id}`}
              key={t.id}
            >
              <div className="cover">
                <SafeImage src={t.coverUrl} alt={t.title} />
                <span className="photo-count">
                  {t.requiredImageCount} 张图片
                </span>
                <span className="card-arrow">↗</span>
              </div>
              <div className="card-caption">
                <div>
                  <small>{t.category}</small>
                  <h2>{t.title}</h2>
                </div>
                <span className="card-number">0{i + 1}</span>
              </div>
            </Link>
            <CoverCredit template={t}/>
            {t.custom&&<div className="template-management"><span>仅自己可见</span><button className="delete-task" aria-label={`删除模板：${t.title}`} onClick={()=>setDeleting(t)}>删除模板</button></div>}
            </article>
          ))}
          <button className="new-template-card" onClick={newTemplate}><span className="new-template-plus">＋</span><strong>新建模板</strong><span>你的风格，你来定义</span><small>自定义封面 · 提示词 · 照片数量</small></button>
        </div>
      )}
      {creating&&<NewTemplateDialog close={()=>setCreating(false)} created={template=>{setTemplates(previous=>[...previous,template]);setCreating(false);setCategory("我的模板");setNotice("模板已创建，仅自己可见。点击模板即可开始创作。");}}/>}
      {deleting&&<DeleteTemplateDialog template={deleting} close={()=>setDeleting(null)} deleted={()=>{setTemplates(previous=>previous.filter(t=>t.id!==deleting.id));setDeleting(null);setNotice("模板已删除。已有作品和正在制作的任务均保留，可在「我的作品」中查看。");}}/>}
      <div className="gallery-bottom">
        <span>✧ 每一次创作，都是一次新的可能</span>
        <small>支持百炼生成与本地模拟，当前模式在制作页显示</small>
      </div>
    </main>
  );
}
