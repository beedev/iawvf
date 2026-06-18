import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useReducedMotion } from '../lib/hooks/useReducedMotion';
import { motion as motionTokens } from '../theme/tokens';

/**
 * A staggered reveal wrapper for the orchestrated page-load. `index` controls the stagger delay.
 * Honors prefers-reduced-motion by rendering statically.
 */
export interface RevealProps {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: 'div' | 'section';
}

export function Reveal({ children, index = 0, className, as = 'div' }: RevealProps) {
  const reduced = useReducedMotion();
  const Component = as === 'section' ? motion.section : motion.div;
  return (
    <Component
      className={className}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              duration: motionTokens.base,
              delay: index * motionTokens.stagger,
              ease: motionTokens.ease,
            }
      }
    >
      {children}
    </Component>
  );
}
