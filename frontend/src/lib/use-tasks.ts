"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { active, api, post, mergeTasks, Task, ApiError } from "./api";

type View = {
  key: string;
  tasks: Task[];
  error: string;
  moreError: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  refreshing: boolean;
  refreshedAt: string;
};
const empty = (key: string): View => ({
  key,
  tasks: [],
  error: "",
  moreError: "",
  loading: true,
  loadingMore: false,
  hasMore: false,
  refreshing: false,
  refreshedAt: "",
});
type Controls = {
  key: string;
  add: (task: Task) => void;
  more: () => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export function useTasks(owner: string, templateId?: string) {
  const key = owner + ":" + (templateId ?? "");
  const [view, setView] = useState<View>(() => empty(key));
  const [revision, setRevision] = useState(0);
  const saved = useRef<View>(empty(""));
  const controls = useRef<Controls | null>(null);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let page = 0;
    let loadingMore = false;
    let polling = false;
    const removed = new Set<string>();
    const added: Task[] = [];
    let current =
      saved.current.key === key
        ? { ...saved.current, loadingMore: false }
        : empty(key);
    const query = templateId
      ? `templateId=${encodeURIComponent(templateId)}&`
      : "";
    function publish(patch: Partial<View>) {
      if (!alive) return;
      current = { ...current, ...patch };
      current.tasks = current.tasks.filter((t) => !removed.has(t.id));
      saved.current = current;
      setView(current);
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      if (alive && !polling && current.tasks.some(active))
        timer = setTimeout(poll, 2000);
    }
    async function poll() {
      const ids = current.tasks.filter(active).map((t) => t.id);
      if (!ids.length || polling) return;
      polling = true;
      let expired = false;
      try {
        for (let i = 0; i < ids.length; i += 50) {
          const updated = await post<Task[]>(
            "/tasks/status-query",
            { taskIds: ids.slice(i, i + 50) },
            abort.signal,
          );
          if (!alive) return;
          publish({ tasks: mergeTasks(current.tasks, updated) });
        }
        publish({ error: "" });
      } catch (e) {
        if (!alive) return;
        publish({ error: e instanceof Error ? e.message : "状态更新失败" });
        expired = e instanceof ApiError && e.status === 401;
      } finally {
        polling = false;
      }
      if (!expired) schedule();
    }
    async function init() {
      publish({ refreshing: true, moreError: "" });
      try {
        const [history, pending] = await Promise.all([
          api<{ items: Task[]; hasMore: boolean }>(`/tasks?${query}page=0`, {
            signal: abort.signal,
          }),
          api<Task[]>(`/tasks/active?${query}`, { signal: abort.signal }),
        ]);
        if (!alive) return;
        const incoming = [...history.items, ...pending];
        const retainedIds = new Set([...incoming, ...added].map(t => t.id));
        publish({
          tasks: mergeTasks(current.tasks.filter(t => retainedIds.has(t.id)), incoming),
          hasMore: history.hasMore,
          loading: false,
          error: "",
          refreshing: false,
          refreshedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        });
        schedule();
      } catch (e) {
        publish({
          error: e instanceof Error ? e.message : "加载失败",
          loading: false,
          refreshing: false,
        });
        if (!(e instanceof ApiError && e.status === 401)) schedule();
      }
    }
    controls.current = {
      key,
      add(task) {
        added.push(task);
        publish({ tasks: mergeTasks(current.tasks, [task]), loading: false });
        schedule();
      },
      async remove(id) {
        await post(`/tasks/${encodeURIComponent(id)}/delete`, {}, abort.signal);
        if (!alive) return;
        removed.add(id);
        publish({ tasks: current.tasks.filter((t) => t.id !== id) });
      },
      async more() {
        if (!alive || loadingMore || !current.hasMore) return;
        loadingMore = true;
        publish({ loadingMore: true, moreError: "" });
        try {
          const data = await api<{ items: Task[]; hasMore: boolean }>(
            `/tasks?${query}page=${page + 1}`,
            { signal: abort.signal },
          );
          if (!alive) return;
          page++;
          publish({
            tasks: mergeTasks(current.tasks, data.items),
            hasMore: data.hasMore,
          });
        } catch (e) {
          publish({
            moreError: e instanceof Error ? e.message : "历史记录加载失败",
          });
        } finally {
          loadingMore = false;
          publish({ loadingMore: false });
        }
      },
    };
    void init();
    return () => {
      alive = false;
      abort.abort();
      if (timer) clearTimeout(timer);
      controls.current = null;
    };
  }, [owner, templateId, key, revision]);
  const add = useCallback(
    (task: Task) => {
      if (controls.current?.key === key) controls.current.add(task);
    },
    [key],
  );
  const more = useCallback(async () => {
    if (controls.current?.key === key) await controls.current.more();
  }, [key]);
  const visible = view.key === key && owner ? view : empty(key);
  const remove = useCallback(async (id: string) => {
    if (controls.current?.key === key) await controls.current.remove(id);
  }, [key]);
  return { ...visible, add, more, remove, retry: () => {
    if (saved.current.refreshing) return;
    saved.current = { ...saved.current, refreshing: true };
    setView((old) => ({ ...old, refreshing: true }));
    setRevision((x) => x + 1);
  } };
}
