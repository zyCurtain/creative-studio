"use client";
import { useRef, useState } from "react";
import { Task, stages, active } from "@/lib/api";
import { useTasks } from "@/lib/use-tasks";
import { SafeImage } from "./safe-image";
export function TaskList({ state }: { state: ReturnType<typeof useTasks> }) {
  const [preview, setPreview] = useState<Task | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  function open(t: Task) {
    setPreview(t);
    dialog.current?.showModal();
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR CREATIONS</span>
          <h2>
            制作记录 <span className="count">{state.tasks.length}</span>
          </h2>
        </div>
        <button
          className="refresh-button"
          onClick={state.retry}
          disabled={state.refreshing || busy}
          aria-label="刷新制作记录"
          aria-busy={state.refreshing}
        >
          <span className={state.refreshing ? "refresh-spin" : ""} aria-hidden="true">↻</span>
          {state.refreshing ? "刷新中…" : "刷新"}
        </button>
      </div>
      <p className="refresh-status" role="status" aria-live="polite">
        {state.refreshing ? "正在获取最新制作记录…" : state.error ? `刷新失败${state.refreshedAt ? ` · 上次更新于 ${state.refreshedAt}` : ""}` : state.refreshedAt ? `刷新完成 · 更新于 ${state.refreshedAt}` : ""}
        {notice && ` · ${notice}`}
      </p>
      {state.error && (
        <div className="notice" role="alert">
          状态更新暂不可用：{state.error}。
          {state.tasks.length > 0
            ? "已保留上次记录。"
            : "暂时无法确认是否有制作记录。"}
          <button onClick={state.retry}>恢复查询</button>
        </div>
      )}
      {state.loading && state.tasks.length === 0 ? (
        <div className="empty">正在读取你的作品…</div>
      ) : state.tasks.length === 0 ? (
        <div className="empty">
          <span className="empty-symbol">✧</span>
          <h3>{state.error ? "制作记录尚未加载" : "你的灵感，从这里开始"}</h3>
          <p>
            {state.error
              ? "请恢复查询后查看，后台任务仍会继续。"
              : "选择图片并开始制作，作品会出现在这里。"}
          </p>
          <small>关闭页面不会中断后台任务</small>
        </div>
      ) : (
        <div className="tasks">
          {state.tasks.map((t) => (
            <article className="task-card" key={t.id}>
              <div className={`task-art ${t.status.toLowerCase()}`}>
                {t.status === "SUCCEEDED" && t.resultUrl ? (
                  <button
                    className="image-button"
                    onClick={() => open(t)}
                    aria-label={`预览${t.templateTitle}`}
                  >
                    <SafeImage
                      src={t.resultUrl}
                      alt={`${t.templateTitle}${t.generationMode === "BAILIAN" ? "生成结果" : "模拟结果"}`}
                    />
                    <span>查看作品 ↗</span>
                  </button>
                ) : (
                  <div className="task-progress">
                    <span className={active(t) ? "spinner" : "failure-symbol"}>
                      {active(t) ? "✳" : "!"}
                    </span>
                    <strong>
                      {t.status === "QUEUED"
                        ? "等待制作"
                        : t.status === "FAILED"
                          ? "本次制作未完成"
                          : (stages[t.currentStage ?? ""] ?? "正在准备")}
                    </strong>
                    <p>
                      {t.status === "FAILED"
                        ? t.errorMessage
                        : "灵感正在成形，你可以继续创作"}
                    </p>
                    {t.failedStage && (
                      <small>失败阶段：{stages[t.failedStage]}</small>
                    )}
                    {active(t) && (
                      <div className="step-dots">
                        {Object.keys(stages).map((s) => (
                          <i
                            key={s}
                            className={s === t.currentStage ? "on" : ""}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="task-meta">
                <strong>{t.templateTitle}</strong>
                <span className={`badge ${t.status.toLowerCase()}`}>
                  {
                    {
                      QUEUED: "排队中",
                      RUNNING: "制作中",
                      SUCCEEDED: "已完成",
                      FAILED: "未完成",
                    }[t.status]
                  }
                </span>
                <small>
                  {new Date(t.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ·{" "}
                  {t.status === "SUCCEEDED"
                    ? (t.generationMode === "BAILIAN" ? "百炼生成" : "模拟生成示例")
                    : `任务 ${t.id.slice(0, 6)}`}
                </small>
                {!active(t) && <button className="delete-task" disabled={state.refreshing || busy} aria-label={`删除${t.templateTitle}制作记录`} onClick={() => {
                  setDeleting(t); setDeleteError(""); deleteDialog.current?.showModal();
                }}>删除记录</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {state.moreError && (
        <div className="notice" role="alert">
          历史加载失败：{state.moreError}。可以再次加载。
        </div>
      )}
      {state.hasMore && (
        <button
          className="load-more"
          disabled={state.loadingMore || state.refreshing}
          onClick={() => void state.more()}
        >
          {state.loadingMore ? "正在加载…" : "加载更早的作品"}
        </button>
      )}
      <dialog ref={deleteDialog} className="account-dialog" aria-labelledby="delete-title" onCancel={(event) => {
        if (busy) event.preventDefault();
      }}>
        <h2 id="delete-title">删除这条制作记录？</h2>
        <p className="account-copy">「{deleting?.templateTitle}」将从制作记录和“我的作品”中移除，结果预览也将不可访问。其他作品不受影响。</p>
        {deleteError && <p className="account-error" role="alert">{deleteError}</p>}
        <div className="delete-actions">
          <button disabled={busy} onClick={() => deleteDialog.current?.close()}>取消</button>
          <button className="delete-confirm" disabled={busy} onClick={async () => {
            if (!deleting || deleteLock.current) return;
            deleteLock.current = true; setBusy(true); setDeleteError("");
            try {
              await state.remove(deleting.id);
              setNotice("制作记录已删除");
              deleteDialog.current?.close();
              if (preview?.id === deleting.id) { dialog.current?.close(); setPreview(null); }
            } catch (e) { setDeleteError(e instanceof Error ? e.message : "删除失败，请重试"); }
            finally { deleteLock.current = false; setBusy(false); }
          }}>{busy ? "正在删除…" : "确认删除"}</button>
        </div>
      </dialog>
      <dialog
        ref={dialog}
        className="preview-dialog"
        aria-labelledby="preview-title"
      >
        <button
          className="close"
          onClick={() => dialog.current?.close()}
          aria-label="关闭预览"
        >
          ×
        </button>
        {preview?.resultUrl && (
          <SafeImage
            key={preview.resultUrl}
            src={preview.resultUrl}
            alt={preview.templateTitle}
          />
        )}
        <p id="preview-title">{preview?.templateTitle} · {preview?.generationMode === "BAILIAN" ? "百炼生成" : "模拟生成示例"}</p>
      </dialog>
    </>
  );
}
