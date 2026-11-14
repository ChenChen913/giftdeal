import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "swap"
  | "gift"
  | "users"
  | "plus"
  | "search"
  | "bell"
  | "chevronDown"
  | "chevronRight"
  | "check"
  | "close"
  | "copy"
  | "arrowRight"
  | "calendar"
  | "phone"
  | "logout"
  | "edit"
  | "trash"
  | "link"
  | "sparkle"
  | "filter"
  | "wallet"
  | "inbox"
  | "info"
  | "eye"
  | "eyeOff"
  | "lock"
  | "download";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5" />
      <path d="M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />
    </>
  ),
  gift: (
    <>
      <path d="M4 12v9h16v-9" />
      <path d="M3 7.5h18V12H3z" />
      <path d="M12 7.5V21" />
      <path d="M12 7.5S10.5 3 8 3a2.2 2.2 0 0 0 0 4.5z" />
      <path d="M12 7.5S13.5 3 16 3a2.2 2.2 0 0 1 0 4.5z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
      <path d="M17.5 15.4c2.1.6 3.5 2.1 3.5 4.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 6.5-2.5 8.5h17c0-2-2.5-2.5-2.5-8.5" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  arrowRight: <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
      <path d="m13.5 7 3.5 3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.7 9l5.3 1.8-5.3 1.9L12 18l-1.7-5.3L5 10.8 10.3 9z" />
      <path d="M18.5 16.5 19.2 19l2.3.8-2.3.9-.7 2.3" />
    </>
  ),
  filter: (
    <>
      <path d="M3.5 6h17M6.5 12h11M10 18h4" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17z" />
      <path d="M3.5 13.5h4l1 2.5h7l1-2.5h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.6 6.4A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-3.1 3.5" />
      <path d="M6.2 8.2A15.4 15.4 0 0 0 2.5 12s3.5 6 9.5 6c1 0 2-.15 2.9-.4" />
      <path d="M10 10a2.8 2.8 0 0 0 4 4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 14.5v2.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 20.5h15" />
    </>
  ),
};

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 20, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
