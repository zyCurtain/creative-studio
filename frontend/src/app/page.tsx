import { Gallery } from "@/components/gallery";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<main className="page empty">正在发现灵感…</main>}>
      <Gallery />
    </Suspense>
  );
}
