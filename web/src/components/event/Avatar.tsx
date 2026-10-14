import Image from "next/image";

/** A member's Discord avatar, round; without one, their initial. */
export function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: 32 | 36 }) {
  const box = size === 32 ? "size-8" : "size-9";
  if (src) return <Image src={src} alt="" width={size} height={size} className={`${box} shrink-0 rounded-full bg-raised`} />;
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center rounded-full bg-raised type-label-s text-fg-secondary uppercase`}>
      {Array.from(name.replace(/^\W+/u, ""))[0] ?? "?"}
    </span>
  );
}
