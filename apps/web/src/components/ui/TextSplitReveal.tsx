import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface TextSplitRevealProps {
    text: string;
    as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
    className?: string;
    splitBy?: "letter" | "word" | "line";
    delay?: number;
    staggerDelay?: number;
    once?: boolean;
}

export default function TextSplitReveal({
    text,
    as: Tag = "h2",
    className = "",
    splitBy = "word",
    delay = 0,
    staggerDelay = 0.04,
    once = true,
}: TextSplitRevealProps) {
    const ref = useRef < HTMLDivElement > (null);
    const isInView = useInView(ref, { once, margin: "-60px" });

    const units = splitBy === "letter"
        ? text.split("")
        : splitBy === "word"
            ? text.split(" ")
            : text.split("\n");

    const separator = splitBy === "letter" ? "" : " ";

    return (
        <Tag ref={ref as any} className={className} aria-label={text}>
            {units.map((unit, i) => (
                <span key={i} style={{ display: "inline-block", overflow: "hidden" }}>
                    <motion.span
                        style={{ display: "inline-block", willChange: "transform" }}
                        initial={{ y: "110%", opacity: 0 }}
                        animate={isInView ? { y: "0%", opacity: 1 } : undefined}
                        transition={{
                            duration: 0.5,
                            delay: delay + i * staggerDelay,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        aria-hidden="true"
                    >
                        {unit === " " ? "\u00A0" : unit}
                    </motion.span>
                    {splitBy !== "letter" && i < units.length - 1 && (
                        <span aria-hidden="true">&nbsp;</span>
                    )}
                </span>
            ))}
        </Tag>
    );
}
