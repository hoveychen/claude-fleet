/**
 * MascotEyesCore — embeddable version of MascotEyes for the overlay window.
 * Renders just the eyes SVG without toggle header or quip bubble.
 * Exposes quip text via onQuip callback so the overlay can render it externally.
 */

import { MascotEyes } from "./MascotEyes";

export function MascotEyesCore({ onQuip }: { onQuip?: (text: string | null) => void } = {}) {
  return <MascotEyes embedded onQuip={onQuip} />;
}
