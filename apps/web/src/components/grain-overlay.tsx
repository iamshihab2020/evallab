export function GrainOverlay() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] h-screen w-screen mix-blend-overlay"
      style={{ opacity: 0.04 }}
    >
      <filter id="lab-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#lab-grain)" />
    </svg>
  );
}
