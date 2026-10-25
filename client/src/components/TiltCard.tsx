import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';

/** A pointer position inside the card: -0.5 is the left/top edge, 0.5 the right/bottom edge. */
export interface PointerSpot {
  x: number;
  y: number;
}

interface TiltCardProps {
  children: ReactNode;
  /** Classes for the tilting surface. Its shape also clips the light reflection. */
  className?: string;
  /** Largest tilt in degrees, reached when the pointer is at an edge. */
  maxTilt?: number;
  /** Where the card leans when no pointer is over it. The centre means lying flat. */
  rest?: PointerSpot;
}

const CENTRE: PointerSpot = { x: 0, y: 0 };
const SPRING = { stiffness: 180, damping: 18, mass: 0.6 };

/**
 * Tilts its content in 3D as if the pointer were pressing on it: the side under the pointer
 * moves away from you. A soft light reflection follows the pointer, and springs smooth every movement.
 */
export function TiltCard({ children, className = '', maxTilt = 10, rest = CENTRE }: TiltCardProps) {
  const pointerX = useMotionValue(rest.x);
  const pointerY = useMotionValue(rest.y);

  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-maxTilt, maxTilt]), SPRING);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [maxTilt, -maxTilt]), SPRING);
  const lightX = useTransform(pointerX, [-0.5, 0.5], [0, 100]);
  const lightY = useTransform(pointerY, [-0.5, 0.5], [0, 100]);
  const light = useMotionTemplate`radial-gradient(circle at ${lightX}% ${lightY}%, rgb(255 255 255 / 0.6), transparent 58%)`;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
  }

  function handlePointerLeave() {
    pointerX.set(rest.x);
    pointerY.set(rest.y);
  }

  return (
    <div className="tilt" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      <motion.div className={`tilt__surface ${className}`} style={{ rotateX, rotateY }}>
        {children}
        <motion.div className="tilt__light" style={{ background: light }} aria-hidden="true" />
      </motion.div>
    </div>
  );
}
