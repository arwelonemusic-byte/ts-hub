import Image from "next/image";
import type { ReactNode } from "react";
import type { T } from "@/lib/i18n";
import type { Award, AwardKind } from "@/lib/types";

/** One illustration layer. `className` sizes and places it; transforms (rotate/flip) go there too. */
function Art({ src, className }: { src: string; className: string }) {
  return (
    <div className={`absolute ${className}`}>
      <Image src={`/illustrations/awards/${src}.png`} alt="" fill sizes="160px" className="object-cover" />
    </div>
  );
}

/** A layer inside a box of the rotated layer's bounding size, centred, like Figma groups a rotated image. */
function Rotated({ box, size, className, src }: { box: string; size: string; className: string; src: string }) {
  return (
    <div className={`absolute flex items-center justify-center ${box}`}>
      <div className={`relative ${size} ${className}`}>
        <Image src={`/illustrations/awards/${src}.png`} alt="" fill sizes="160px" className="object-cover" />
      </div>
    </div>
  );
}

/**
 * Figma "Ачивки" (26:3622): each card glows in its own colour from the right edge, where its
 * illustration sits. Every illustration frame is anchored to the card's right edge (the design's
 * cards are 312px wide); the card clips whatever spills past it. Offsets, sizes, crops and
 * rotations are the design's.
 */
const ART: Record<AwardKind, { glow: string; art?: ReactNode }> = {
  butcher: {
    // The butcher's glow darkens as it fades (the design's stops), the others just fade.
    glow: "rgb(212 16 21 / 0.14), rgb(159 12 16 / 0.105) 25%, rgb(106 8 10 / 0.07) 50%, rgb(53 4 5 / 0.035) 75%, transparent",
    art: (
      <div className="absolute top-[3px] right-0 h-[93px] w-[90px] overflow-hidden">
        <Art src="butcher" className="top-0 left-0 h-[117.2%] w-[121.11%]" />
      </div>
    ),
  },
  demolitionist: {
    glow: "rgb(255 104 12 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[84px] -scale-x-100 overflow-hidden">
        <Art src="demolitionist" className="top-[12.5%] left-[-52.38%] h-[133.33%] w-[152.38%]" />
      </div>
    ),
  },
  rocketman: {
    glow: "rgb(255 104 12 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[84px] overflow-hidden">
        <Art src="rocketman" className="top-[16.34px] left-[2.9px] size-[78.31px] -scale-x-100" />
        <Rotated src="rocketman" box="top-[32px] left-[-2px] size-[96.229px]" size="size-[78.31px]" className="-scale-y-100 rotate-[164.67deg]" />
        <Rotated src="rocketman" box="top-[18px] left-[27px] size-[89.237px]" size="size-[78.31px]" className="-scale-y-100 rotate-[-171.32deg]" />
      </div>
    ),
  },
  firstBlood: {
    glow: "rgb(255 146 93 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[63px]">
        <Rotated src="first-blood" box="top-0 left-[-40px] size-[125.539px]" size="size-[91.901px]" className="-rotate-30" />
      </div>
    ),
  },
  firstToDie: {
    glow: "rgb(240 246 251 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[57px]">
        <Art src="first-to-die" className="top-[11px] left-[-18px] size-[105px]" />
      </div>
    ),
  },
  returnee: {
    glow: "rgb(251 98 100 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[82px]">
        <Art src="returnee" className="top-[20px] left-0 size-[101px]" />
      </div>
    ),
  },
  notForLong: {
    glow: "rgb(127 51 255 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[85px]">
        <Rotated src="not-for-long" box="top-[-1px] left-[-23px] size-[146.202px]" size="size-[114.639px]" className="rotate-[-19.39deg]" />
      </div>
    ),
  },
  hitYourOwn: {
    glow: "rgb(247 247 20 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[94px]">
        <Rotated src="hit-your-own" box="top-[-13px] left-[-23px] size-[158.32px]" size="size-[117.565px]" className="rotate-[-27.22deg]" />
      </div>
    ),
  },
  untouchables: {
    glow: "rgb(57 214 237 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-[136px] w-[97px] -scale-x-100 overflow-hidden">
        <Art src="untouchables" className="top-[25.74%] left-[-24.74%] h-[88.97%] w-[124.74%]" />
      </div>
    ),
  },
  // Figma 56:1937.
  toughNut: {
    glow: "rgb(255 150 64 / 0.14), transparent",
    art: (
      <div className="absolute top-0 right-0 h-24 w-[94px]">
        <Art src="tough-nut" className="top-[16px] left-[9px] size-[105px] -scale-y-100 rotate-180" />
      </div>
    ),
  },
};

export function AwardCard({ award, t }: { award: Award; t: T }) {
  const { glow, art } = ART[award.kind];
  return (
    <div
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-lg p-4"
      // The glow's ellipse is the design's: centred on the right edge, 51.76% × 168.2% of the card.
      style={{ background: `radial-gradient(51.76% 168.2% at 100% 47.4%, ${glow}), var(--ts-color-bg-page)` }}
    >
      <span className="type-eyebrow text-fg-accent">{t(`award.${award.kind}`)}</span>
      <span className="flex flex-col type-label-m text-fg">
        {award.players.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </span>
      <span className="type-caption text-fg-secondary">{award.detail}</span>
      {art}
    </div>
  );
}
