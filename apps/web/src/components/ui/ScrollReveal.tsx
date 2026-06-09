import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";

interface ScrollRevealProps {
    children: React.ReactNode;
    direction?: "up" | "down" | "left" | "right" | "none";
    delay?: number;
    duration?: number;
    distance?: number;
    once?: boolean;
    className?: string;
    stagger?: number;
}

const directionMap = {
    up: { y: 1, x: 0 },
    down: { y: -1, x: 0 },
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
    none: { x: 0, y: 0 },
};

export default function ScrollReveal({
    children,
    direction = "up",
    delay = 0,
    duration = 0.7,
    distance = 40,
    once = true,
    className = "",
    stagger = 0,
}: ScrollRevealProps) {
    const ref = useRef < HTMLDivElement > (null);
    const isInView = useInView(ref, { once, margin: "-80px" });
    const { x: dx, y: dy } = directionMap[direction];

    return (
        <motion.div
            ref={ref}
            className={className}
            initial={{ opacity: 0, x: dx * distance, y: dy * distance }}
            animate={isInView ? { opacity: 1, x: 0, y: 0 } : undefined}
            transition={{
                duration,
                delay: delay + stagger,
                ease: [0.16, 1, 0.3, 1],
            }}
        >
            {children}
        </motion.div>
    );
}
