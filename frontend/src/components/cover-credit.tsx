import { Template } from "@/lib/api";
export function CoverCredit({template}:{template:Template}) {
  const credit = template.coverCredit;
  if (!credit) return null;
  return <p className="cover-credit">封面示意 · <a href={credit.source} target="_blank" rel="noreferrer" title={credit.title}>{credit.author}</a>{" · "}<a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a><span> · 缩略图，页面裁切展示</span></p>;
}
