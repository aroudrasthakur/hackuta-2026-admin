const LOGO_WIDTHS = [120, 240, 400] as const;

const LOGO_SRC_SET = LOGO_WIDTHS.map(
  (width) => `/images/logos/hackuta-logo-${width}.webp ${width}w`,
).join(", ");

type HackUtaLogoProps = {
  className?: string;
};

export function HackUtaLogo({ className = "" }: HackUtaLogoProps) {
  return (
    <img
      src="/images/logos/hackuta-logo-240.webp"
      srcSet={LOGO_SRC_SET}
      sizes="120px"
      alt="HackUTA"
      className={className}
      width={120}
      height={36}
      decoding="async"
    />
  );
}
