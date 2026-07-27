/** Hand-rolled 1.5-stroke icon set so the surface keeps one coherent style. */

type IconProps = { className?: string };

function base(props: IconProps) {
  return {
    className: props.className,
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  );
}

export function ArrowOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 4H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 3H13v3.5M13 3 7.5 8.5" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.3 9.6a5.6 5.6 0 0 1-6.9-6.9A5.6 5.6 0 1 0 13.3 9.6Z" />
    </svg>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 8a5 5 0 1 1-1.7-3.75" />
      <path d="M13 2.8v2.7h-2.7" />
    </svg>
  );
}

export function EraseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13h10M5.5 13 2.9 10.4a1 1 0 0 1 0-1.4L8.6 3.3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1 0 1.4L8.7 12" />
    </svg>
  );
}
