// The PROMISE WAR mark: a shield (verification, trust) pierced by a gavel
// strike-line (adjudication) — used as both the in-app logo and the favicon
// source (public/favicon.svg is the same glyph, exported standalone).
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 8 L52 18 V30 C52 42 44 50 32 56 C20 50 12 42 12 30 V18 Z"
        fill="none"
        stroke="#00F0FF"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M32 18 L32 40 M24 26 L40 26" stroke="#00F0FF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="46" r="3" fill="#00F0FF" />
    </svg>
  );
}
