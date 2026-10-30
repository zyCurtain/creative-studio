"use client";
import { useEffect, useRef, useState } from "react";
import { api, Asset, Template } from "./api";
export type Slot = {
  status: "empty" | "uploading" | "ready" | "error";
  asset?: Asset;
  error?: string;
};
export function useUploads(template: Template) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: template.requiredImageCount }, () => ({
      status: "empty",
    })),
  );
  const requests = useRef(new Map<number, AbortController>());
  const versions = useRef<number[]>([]);
  useEffect(() => {
    const current = requests.current;
    return () => {
      current.forEach((c) => c.abort());
    };
  }, []);
  function update(index: number, slot: Slot) {
    setSlots((prev) => prev.map((s, i) => (i === index ? slot : s)));
  }
  function remove(index: number) {
    requests.current.get(index)?.abort();
    requests.current.delete(index);
    versions.current[index] = (versions.current[index] ?? 0) + 1;
    update(index, { status: "empty" });
  }
  async function upload(index: number, file: File) {
    remove(index);
    const version = versions.current[index];
    if (
      !template.acceptedMimeTypes.includes(file.type) ||
      file.size > template.maxFileSizeBytes ||
      !file.size
    ) {
      update(index, {
        status: "error",
        error: "请选择非空 JPEG / PNG，单张不超过 5 MiB",
      });
      return;
    }
    const controller = new AbortController();
    requests.current.set(index, controller);
    update(index, { status: "uploading" });
    const body = new FormData();
    body.append("file", file);
    try {
      const asset = await api<Asset>("/assets", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!controller.signal.aborted && versions.current[index] === version)
        update(index, { status: "ready", asset });
    } catch (e) {
      if (!controller.signal.aborted && versions.current[index] === version)
        update(index, {
          status: "error",
          error: e instanceof Error ? e.message : "上传失败，请重新选择",
        });
    }
  }
  return { slots, upload, remove };
}
