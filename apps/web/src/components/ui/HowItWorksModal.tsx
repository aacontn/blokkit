import { useEffect, useRef, useState } from "react";
import {
    AnimatePresence,
    motion,
    animate,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
    type AnimationPlaybackControls,
} from "framer-motion";
import { FundaScene, Hud, STEPS } from "./HowItWorksScroll.tsx";
import "./HowItWorksScroll.css";

/* ─────────────────────────────────────────────────────────
   CÓMO FUNCIONA — modal playback.
   Reuses the FundaScene timeline from the pinned section,
   but driven by a tween instead of scroll: opens from any
   [data-how-modal-trigger] element, autoplays the 5 phases
   start-to-finish, and lets the user jump per step (the
   playhead resumes to the end from wherever it lands).
   Reduced motion: no tween — steps swap as static frames.
   ───────────────────────────────────────────────────────── */

const DURATION = 16; // seconds for the full 0→1 run
const endOf = (i: number) => (i + 1) / 5 - 0.004;

export default function HowItWorksModal() {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState(0);
    const [done, setDone] = useState(false);
    const progress = useMotionValue(0);
    const reduced = useReducedMotion();
    const controlsRef = useRef<AnimationPlaybackControls | null>(null);
    const kickoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);

    /* Any element with [data-how-modal-trigger] opens the modal;
       anchors keep their href as no-JS fallback. */
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const t = (e.target as HTMLElement).closest("[data-how-modal-trigger]");
            if (!t) return;
            e.preventDefault();
            triggerRef.current = t as HTMLElement;
            setOpen(true);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    const playFrom = (from: number) => {
        // a manual jump must always win over the queued autoplay kickoff
        if (kickoffRef.current) {
            clearTimeout(kickoffRef.current);
            kickoffRef.current = null;
        }
        controlsRef.current?.stop();
        progress.set(from);
        setDone(false);
        controlsRef.current = animate(progress, 1, {
            duration: DURATION * (1 - from),
            ease: "linear",
            onComplete: () => setDone(true),
        });
    };

    const goTo = (i: number) => {
        if (kickoffRef.current) {
            clearTimeout(kickoffRef.current);
            kickoffRef.current = null;
        }
        if (reduced) {
            controlsRef.current?.stop();
            progress.set(endOf(i));
            setDone(i === 4);
            return;
        }
        const start = i / 5 + 0.002;
        controlsRef.current?.stop();
        setDone(false);
        controlsRef.current = animate(progress, start, {
            duration: 0.3,
            ease: "easeOut",
            onComplete: () => playFrom(start),
        });
    };

    const close = () => {
        controlsRef.current?.stop();
        setOpen(false);
    };

    /* Open: lock scroll (Lenis included), bind Escape, kick playback */
    useEffect(() => {
        if (!open) return;
        const lenis = (window as typeof window & { lenis?: { stop: () => void; start: () => void } }).lenis;
        lenis?.stop();
        document.documentElement.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);

        setPhase(0);
        progress.set(0);
        if (reduced) {
            progress.set(endOf(0));
            setDone(false);
        } else {
            // let the dialog entrance settle before the run starts
            kickoffRef.current = setTimeout(() => playFrom(0), 550);
        }
        cardRef.current?.focus();

        return () => {
            if (kickoffRef.current) {
                clearTimeout(kickoffRef.current);
                kickoffRef.current = null;
            }
            controlsRef.current?.stop();
            window.removeEventListener("keydown", onKey);
            document.documentElement.style.overflow = "";
            lenis?.start();
            triggerRef.current?.focus();
        };
    }, [open]);

    useMotionValueEvent(progress, "change", (v) => {
        const idx = Math.min(4, Math.max(0, Math.floor(v * 5)));
        setPhase((prev) => (prev === idx ? prev : idx));
    });

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="hiw-modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) close();
                    }}
                >
                    <motion.div
                        className="hiw-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Cómo funciona BloKKit"
                        tabIndex={-1}
                        ref={cardRef}
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <header className="hiw-modal-head">
                            <div>
                                <span className="hiw-label">· Cómo funciona</span>
                                <p className="hiw-modal-title">El sistema en 5 pasos</p>
                            </div>
                            <button
                                type="button"
                                className="hiw-modal-close"
                                onClick={close}
                                aria-label="Cerrar"
                            >
                                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </button>
                        </header>

                        <div className="hiw-modal-progress" aria-hidden="true">
                            <motion.div className="hiw-modal-progress-fill" style={{ scaleX: progress }} />
                        </div>

                        <div className="hiw-modal-body">
                            <div className="hiw-modal-scene">
                                <FundaScene progress={progress} />
                                <Hud phase={phase} />
                            </div>

                            <div className="hiw-modal-rail">
                                <div className="hiw-modal-steps">
                                    {STEPS.map((s, i) => (
                                        <button
                                            key={s.num}
                                            type="button"
                                            className={`hiw-step ${phase === i ? "hiw-step--active" : ""}`}
                                            onClick={() => goTo(i)}
                                            aria-current={phase === i ? "step" : undefined}
                                        >
                                            <span className="hiw-step-num">{s.num}</span>
                                            <span className="hiw-step-body">
                                                <span className="hiw-step-title">{s.title}</span>
                                                <span className="hiw-step-desc">{s.desc}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* mobile-only: fixed slot for the active step's
                                    description, so the rail rows stay compact */}
                                <motion.p
                                    key={`desc-${phase}`}
                                    className="hiw-modal-active-desc"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    {STEPS[phase].desc}
                                </motion.p>

                                <footer className="hiw-modal-foot">
                                    <button
                                        type="button"
                                        className={`hiw-modal-replay ${done ? "hiw-modal-replay--ready" : ""}`}
                                        onClick={() => goTo(0)}
                                    >
                                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                            <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                            <path d="M13.7 1.6v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Ver de nuevo
                                    </button>
                                    <a href="/producto" className="hiw-modal-link">
                                        Ver el producto en detalle →
                                    </a>
                                </footer>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
