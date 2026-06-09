import { useRef, useState, useCallback } from "react";

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, React.AnchorHTMLAttributes<HTMLAnchorElement> {
    children: React.ReactNode;
    className?: string;
    strength?: number;
    as?: "button" | "a";
}

export default function MagneticButton({
    children,
    className = "",
    strength = 0.3,
    as: Tag = "button",
    href,
    onClick,
    ...rest
}: MagneticButtonProps) {
    const btnRef = useRef<HTMLElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0 });

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!btnRef.current) return;
            const rect = btnRef.current.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) * strength;
            const dy = (e.clientY - cy) * strength;
            setTransform({ x: dx, y: dy });
        },
        [strength],
    );

    const handleMouseLeave = useCallback(() => {
        setTransform({ x: 0, y: 0 });
    }, []);

    const props: any = {
        ...rest,
        ref: btnRef,
        className,
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        onClick,
        style: {
            transform: `translate(${transform.x}px, ${transform.y}px)`,
            transition: transform.x === 0 ? "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
            willChange: "transform",
        },
    };

    if (Tag === "a" && href) {
        props.href = href;
    }

    return <Tag {...props}>{children}</Tag>;
}
