"use client";
import { useState } from "react";
import type { ImgHTMLAttributes } from "react";
// Image transport errors never change the task's execution status.
export function SafeImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string>();
  if (failedSource && failedSource === props.src)
    return (
      <span
        className={`image-unavailable ${props.className ?? ""}`}
        role="img"
        aria-label={`${props.alt ?? "图片"}暂不可用`}
      >
        ◇<small>图片暂不可用</small>
      </span>
    );
  return (
    <img
      {...props}
      alt={props.alt ?? ""}
      onError={() =>
        setFailedSource(typeof props.src === "string" ? props.src : undefined)
      }
    />
  );
}
