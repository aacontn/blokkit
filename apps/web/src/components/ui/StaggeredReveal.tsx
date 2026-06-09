import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface StaggeredRevealProps {
    children: React.ReactNode;
    className?: string;
    delay?: number;
    staggerDelay?: number;
    once?: boolean;
}

export default function StaggeredReveal({
    children,
    className = "",
    delay = 0,
    staggerDelay = 0.1,
    once = true,
}: StaggeredRevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once, margin: "-100px" });

    // Assuming children is an array of elements (like cards or list items)
    // We wrap each child in a motion.div
    const childrenArray = Array.isArray(children) ? children : [children];

    return (
        <div ref={ref} className={className}>
            {childrenArray.map((child, i) => (
                <motion.div
                    key={i}
                    initial={{ y: 50, opacity: 0, scale: 0.95 }}
                    animate={isInView ? { y: 0, opacity: 1, scale: 1 } : undefined}
                    transition={{
                        type: "spring",
                        stiffness: 100,
                        damping: 15,
                        delay: delay + i * staggerDelay,
                    }}
                >
                    {child}
                </motion.div>
            ))}
        </div>
    );
}
