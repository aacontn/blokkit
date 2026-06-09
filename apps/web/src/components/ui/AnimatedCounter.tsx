import { useRef, useEffect } from "react";
import { motion, useInView, useSpring, useMotionValue } from "framer-motion";

interface AnimatedCounterProps {
    value: number;
    suffix?: string;
    prefix?: string;
    duration?: number;
    delay?: number;
    className?: string;
    once?: boolean;
}

export default function AnimatedCounter({
    value,
    suffix = "",
    prefix = "",
    duration = 2,
    delay = 0,
    className = "",
    once = true,
}: AnimatedCounterProps) {
    const ref = useRef < HTMLSpanElement > (null);
    const isInView = useInView(ref, { once, margin: "-40px" });
    const motionValue = useMotionValue(0);
    const spring = useSpring(motionValue, {
        damping: 40,
        stiffness: 100,
        duration: duration * 1000,
    });

    useEffect(() => {
        if (isInView) {
            const timer = setTimeout(() => {
                motionValue.set(value);
            }, delay * 1000);
            return () => clearTimeout(timer);
        }
    }, [isInView, value, delay, motionValue]);

    useEffect(() => {
        const unsubscribe = spring.on("change", (latest) => {
            if (ref.current) {
                const rounded = value % 1 !== 0 ? latest.toFixed(1) : Math.round(latest);
                ref.current.textContent = `${prefix}${rounded}${suffix}`;
            }
        });
        return unsubscribe;
    }, [spring, prefix, suffix, value]);

    return (
        <span ref={ref} className={className}>
            {prefix}0{suffix}
        </span>
    );
}
