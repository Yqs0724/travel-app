import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, className = "", ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `shrink-0 ${className}`,
    "aria-hidden": true as const,
    ...rest,
  };
}

/** 行程 / 地图 */
export function IconMap(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5 9 4.5Z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </svg>
  );
}

/** AI */
export function IconSpark(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5v3M12 17.5v3M4.5 12h3M16.5 12h3" />
      <path d="m7 7 1.5 1.5M15.5 15.5 17 17M17 7l-1.5 1.5M8.5 15.5 7 17" />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

/** 清单 */
export function IconCheckList(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m4 6 1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17" />
    </svg>
  );
}

/** 记账 */
export function IconWallet(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 8.5h14A2.5 2.5 0 0 1 20 11v7.5A2.5 2.5 0 0 1 17.5 21h-14A1.5 1.5 0 0 1 2 19.5v-9A2 2 0 0 1 4 8.5Z" />
      <path d="M3.5 8.5 5 4.5h11l1.2 4" />
      <circle cx="15.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 分享 */
export function IconShare(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="18" cy="5.5" r="2.25" />
      <circle cx="6" cy="12" r="2.25" />
      <circle cx="18" cy="18.5" r="2.25" />
      <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
    </svg>
  );
}

/** 协作 / 钥匙 */
export function IconKey(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="8" cy="10" r="3.5" />
      <path d="M11 10h9.5l-1.5 1.5L20.5 13 19 14.5l1.5 1.5H15" />
    </svg>
  );
}

/** 编辑 */
export function IconEdit(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M13.5 5.5 18 10l-9.5 9.5H4v-4.5L13.5 5.5Z" />
      <path d="m11.5 7.5 4 4" />
    </svg>
  );
}

/** 删除 */
export function IconTrash(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 7h15M9.5 7V5h5v2M7 7l.8 12.5h8.4L17 7" />
    </svg>
  );
}

/** 退出 */
export function IconLogout(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 5.5H6.5A2 2 0 0 0 4.5 7.5v9a2 2 0 0 0 2 2H10" />
      <path d="M13 12h7M17 8.5 20.5 12 17 15.5" />
    </svg>
  );
}

/** 加号 / 添加 */
export function IconPlus(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/** 地点钉 */
export function IconPin(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 21s6.5-5.2 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.8 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.25" />
    </svg>
  );
}

/** 周边 */
export function IconNearby(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/** 天气 / 建议 */
export function IconCloud(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7.5 17.5h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.5A3.5 3.5 0 0 0 7.5 17.5Z" />
    </svg>
  );
}

/** 解锁 */
export function IconUnlock(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2" />
    </svg>
  );
}
