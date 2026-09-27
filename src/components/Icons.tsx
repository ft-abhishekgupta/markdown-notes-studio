import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const make =
  (path: React.ReactNode, defaultSize = 18) =>
  ({ size = defaultSize, ...rest }: P) => (
    <svg {...base(size)} {...rest} aria-hidden="true">
      {path}
    </svg>
  );

export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  16,
);

export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>,
);

export const IconMoon = make(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />);

export const IconCopy = make(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
  15,
);

export const IconDownload = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </>,
  15,
);

export const IconUpload = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 8l5-5 5 5M12 3v12" />
  </>,
  15,
);

export const IconCheck = make(<path d="M20 6 9 17l-5-5" />, 16);

export const IconCheckCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </>,
);

export const IconCircle = make(<circle cx="12" cy="12" r="9" />);

export const IconChevronRight = make(<path d="m9 18 6-6-6-6" />, 15);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />, 15);
export const IconChevronLeft = make(<path d="m15 18-6-6 6-6" />, 15);
export const IconArrowRight = make(<path d="M5 12h14M13 5l7 7-7 7" />, 16);

export const IconBookmark = make(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />);
export const IconBookmarkFilled = ({ size = 18, ...rest }: P) => (
  <svg {...base(size)} fill="currentColor" {...rest} aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

export const IconMenu = make(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />, 16);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </>,
);

export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  15,
);

export const IconHelp = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" />
    <path d="M12 17h.01" />
  </>,
);

export const IconPrint = make(
  <>
    <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </>,
  15,
);

export const IconHome = make(<path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z" />, 16);

export const IconLayers = make(
  <>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </>,
);

export const IconCards = make(
  <>
    <rect x="2.5" y="6" width="14" height="14" rx="2.5" />
    <path d="M7 3h11a3.5 3.5 0 0 1 3.5 3.5v11" />
  </>,
  16,
);

export const IconZap = make(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />, 16);

export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </>,
  16,
);

export const IconTrash = make(
  <>
    <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
    <path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </>,
  15,
);

export const IconShuffle = make(
  <>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </>,
  16,
);

export const IconNote = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </>,
  16,
);

export const IconExpand = make(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />, 15);

export const IconAlert = make(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

export const IconInfo = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </>,
);

export const IconFlame = make(
  <path d="M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.8-3 .8-3S8 10 9 11c0-3 3-6 3-9Z" />,
  16,
);

/* ---------- Editing ---------- */

export const IconPlus = make(<path d="M12 5v14M5 12h14" />, 16);
export const IconMinus = make(<path d="M5 12h14" />, 16);

export const IconPencil = make(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  15,
);

export const IconEye = make(
  <>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
  15,
);

export const IconGrip = make(
  <>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </>,
  15,
);

export const IconMore = make(
  <>
    <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </>,
  15,
);

export const IconFolder = make(
  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />,
  15,
);

export const IconFolderPlus = make(
  <>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
    <path d="M11 11v5M8.5 13.5h5" />
  </>,
  15,
);

export const IconFilePlus = make(
  <>
    <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
    <path d="M14 2.5v5h5M12 11.5v6M9 14.5h6" />
  </>,
  15,
);

export const IconImage = make(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 17 4.5-4.5L12 16l3-3 5 5" />
  </>,
  15,
);

export const IconTable = make(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 10h18M3 15h18M9.5 10v9.5M15.5 10v9.5" />
  </>,
  15,
);

export const IconCode = make(<path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4M13.5 5l-3 14" />, 15);

export const IconQuote = make(
  <path d="M8.5 6C6 6 4 8 4 10.5S6 15 8.5 15c0 2-1 3-3 3.5 4 0 7-3 7-7.5V6ZM20 6c-2.5 0-4.5 2-4.5 4.5S17.5 15 20 15c0 2-1 3-3 3.5 4 0 7-3 7-7.5V6Z" />,
  15,
);

export const IconList = make(<path d="M9 6h12M9 12h12M9 18h12M4.5 6h.01M4.5 12h.01M4.5 18h.01" />, 15);

export const IconListOrdered = make(
  <>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 5.5 5.5 5v4M3.5 13.2c.2-.7.9-1.2 1.6-1 .8.1 1.2 1 .7 1.6L3.6 16h2.7" />
  </>,
  15,
);

export const IconCheckSquare = make(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="m8 12 2.6 2.6L16.5 9" />
  </>,
  15,
);

export const IconHeading = make(<path d="M6 4v16M18 4v16M6 12h12" />, 15);

export const IconBold = make(<path d="M7 4h6.5a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z" />, 15);
export const IconItalic = make(<path d="M19 4h-7M12 20H5M15 4 9 20" />, 15);
export const IconStrike = make(<path d="M4 12h16M7.5 8a4 4 0 0 1 4-4h2a4 4 0 0 1 3.6 2M16.5 16a4 4 0 0 1-4 4h-2a4 4 0 0 1-3.6-2" />, 15);

export const IconLink = make(
  <>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.4 1.4" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.4-1.4" />
  </>,
  15,
);

export const IconDiagram = make(
  <>
    <rect x="8.5" y="2.5" width="7" height="5" rx="1.5" />
    <rect x="2" y="16" width="7" height="5" rx="1.5" />
    <rect x="15" y="16" width="7" height="5" rx="1.5" />
    <path d="M12 7.5V12M5.5 16v-2.5h13V16" />
  </>,
  15,
);

export const IconArrowUp = make(<path d="M12 20V4M5 11l7-7 7 7" />, 15);
export const IconArrowDown = make(<path d="M12 4v16M5 13l7 7 7-7" />, 15);
export const IconChevronUp = make(<path d="m6 15 6-6 6 6" />, 15);

export const IconSave = make(
  <>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </>,
  15,
);

export const IconUndo = make(<path d="M3 8h11a5.5 5.5 0 0 1 0 11H8M3 8l4-4M3 8l4 4" />, 15);
export const IconRedo = make(<path d="M21 8H10a5.5 5.5 0 0 0 0 11h6M21 8l-4-4M21 8l-4 4" />, 15);

export const IconMarkdown = make(
  <>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M6 15.5v-7l3 3.5 3-3.5v7M16 8.5v7M16 15.5l-2-2.2M16 15.5l2-2.2" />
  </>,
  15,
);

export const IconWand = make(
  <>
    <path d="M5 19 19 5M15 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM5.5 9l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4L3.4 11l1.4-.7Z" />
  </>,
  15,
);

export const IconPanelLeft = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
    <path d="M5.8 8.5h1.4M5.8 12h1.4" />
  </>,
  18,
);

export const IconPanelLeftClosed = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
  </>,
  18,
);

/* ---------- Section icons ---------- */
const sectionIcons: Record<string, React.ReactNode> = {
  binary: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="M6.5 10v4.5A2.5 2.5 0 0 0 9 17h5M14 6.5h3a2.5 2.5 0 0 1 2.5 2.5v2" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="4.5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M12 7v4M12 11 6.4 16.8M12 11l5.6 5.8" />
    </>
  ),
  blueprint: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12M13 13h4M13 17h4" />
    </>
  ),
  cube: (
    <>
      <path d="m12 2.5 8.5 4.8v9.4L12 21.5 3.5 16.7V7.3Z" />
      <path d="M3.8 7.2 12 12l8.2-4.8M12 12v9.5" />
    </>
  ),
  puzzle: (
    <path d="M10 3.5a2 2 0 1 1 4 0V5h3.5a1.5 1.5 0 0 1 1.5 1.5V10h1.5a2 2 0 1 1 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 1 0-4 0V19H6.5A1.5 1.5 0 0 1 5 17.5V14H3.5a2 2 0 1 1 0-4H5V6.5A1.5 1.5 0 0 1 6.5 5H10Z" />
  ),
  dotnet: (
    <>
      <circle cx="4" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M9 19V8l7 11V8" />
      <path d="M19.5 8h3M21 8v11" />
    </>
  ),
  server: (
    <>
      <rect x="2.5" y="3.5" width="19" height="7" rx="2" />
      <rect x="2.5" y="13.5" width="19" height="7" rx="2" />
      <path d="M6.5 7h.01M6.5 17h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  cloud: (
    <path d="M7 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a4.25 4.25 0 0 1-.5 8.5Z" />
  ),
  queue: (
    <>
      <rect x="2.5" y="8" width="6" height="8" rx="1.5" />
      <rect x="10" y="8" width="6" height="8" rx="1.5" />
      <path d="M19 8v8M21.5 10.5 19 8l-2.5 2.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3 12.6 7.4 17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6Z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </>
  ),
  browser: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M2.5 9h19M6 6.5h.01M9 6.5h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.3-8 9.5-4.6-1.2-8-4.5-8-9.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  container: (
    <>
      <rect x="2.5" y="9" width="5" height="5" rx="0.8" />
      <rect x="9" y="9" width="5" height="5" rx="0.8" />
      <rect x="9" y="3.5" width="5" height="4.5" rx="0.8" />
      <path d="M2 15.5c2.5 4 7 5 10.5 5 5.5 0 8.5-3 9.5-7-1.5-1-4-1-5 0" />
    </>
  ),
  pulse: <path d="M2.5 12h4l2.5-7 4 14 2.5-7h6" />,
  check: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v16H5.5A1.5 1.5 0 0 0 4 20.5Z" />
      <path d="M4 20.5A1.5 1.5 0 0 1 5.5 19H19v2.5H5.5A1.5 1.5 0 0 1 4 20.5Z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.6a6.5 6.5 0 0 1 3.5 5.4" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2.5v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7.5 8.5h9a4.5 4.5 0 0 1 4.4 3.6l.8 4A3.2 3.2 0 0 1 18.6 20c-1 0-1.9-.5-2.5-1.3L15 17H9l-1.1 1.7C7.3 19.5 6.4 20 5.4 20a3.2 3.2 0 0 1-3.1-3.9l.8-4A4.5 4.5 0 0 1 7.5 8.5Z" />
      <path d="M7.5 12.5v2M6.5 13.5h2M15.5 12.5h.01M17.5 14.5h.01" />
    </>
  ),
};

export const SECTION_ICON_NAMES = Object.keys(sectionIcons);

export function SectionIcon({ name, size = 18, ...rest }: P & { name: string }) {
  return (
    <svg {...base(size)} {...rest} aria-hidden="true">
      {sectionIcons[name] ?? sectionIcons.book}
    </svg>
  );
}
