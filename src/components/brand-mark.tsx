import Link from "next/link";

export function BrandMark({ linked = true }: { linked?: boolean }) {
  const content = <>
    <span className="brand-monogram" aria-hidden="true">РФМ</span>
    <span className="brand-copy"><b>Судейская</b><small>платформа миникапа</small></span>
  </>;

  return linked
    ? <Link className="brand-mark" href="/" aria-label="Судейская платформа РФМ — турниры">{content}</Link>
    : <div className="brand-mark brand-mark-static">{content}</div>;
}
