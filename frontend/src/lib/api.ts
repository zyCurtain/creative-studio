export type Template = {
  custom?: boolean;
  prompt?: string;
  coverCredit?: { title: string; author: string; source: string; license: string; licenseUrl: string } | null;
  id: string;
  title: string;
  category: string;
  description: string;
  requiredImageCount: number;
  coverUrl: string;
  maxFileSizeBytes: number;
  acceptedMimeTypes: string[];
};
export type Task = {
  generationMode?: "SIMULATION" | "BAILIAN";
  generationModel?: string | null;
  id: string;
  templateId: string;
  templateTitle: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  currentStage: string | null;
  failedStage: string | null;
  errorMessage: string | null;
  resultUrl: string | null;
  createdAt: string;
  version: number;
};
export type Asset = { id: string; previewUrl: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(25000);
  const response = await fetch(`/api${path}`, {
    ...init,
    cache: "no-store",
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message ?? "请求失败，请重试", response.status);
  }
  return response.json();
}
export function post<T>(path: string, value: unknown, signal?: AbortSignal) {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    signal,
  });
}
export const active = (task: Task) =>
  task.status === "QUEUED" || task.status === "RUNNING";
export const stages: Record<string, string> = {
  CHECK_ASSETS: "素材检查",
  GENERATE: "图片生成",
  PACKAGE_RESULT: "结果整理",
};
export function mergeTasks(previous: Task[], incoming: Task[]): Task[] {
  const map = new Map(previous.map((t) => [t.id, t]));
  for (const t of incoming) {
    const old = map.get(t.id);
    if (!old || t.version > old.version) map.set(t.id, t);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}
