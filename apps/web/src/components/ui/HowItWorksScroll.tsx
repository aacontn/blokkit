import { useEffect, useId, useRef, useState } from "react";
import {
    motion,
    animate,
    useScroll,
    useTransform,
    useMotionValue,
    useMotionValueEvent,
    useInView,
    useReducedMotion,
    type MotionValue,
} from "framer-motion";
import "./HowItWorksScroll.css";

/* ─────────────────────────────────────────────────────────
   CÓMO FUNCIONA — scroll-driven product schematic.
   One continuous SVG scene of the real BloKKit pouch plays
   the 5 operation steps, pinned while the user scrolls.
   Faithful to the physical product (reference photos + deck):
   floppy black neoprene sleeve, self-colored binding. The
   mouth is TWO HALVES that part symmetrically — front lip
   dips, back lip lifts — and the pin on the front panel is
   ALWAYS visible. The unlocker is the 3D-printed padlock-
   shaped base (~25×30) holding the ~8cm magnet cylinder; the
   pouch tips over it and the magnet releases THE PIN.
   Wordmark: official logo asset, not redrawn type.
   Mobile / reduced-motion: stacked cards, each animating its
   own slice of the same timeline when it enters the viewport.
   Phases (global progress 0→1, five equal fifths):
   01 guarda · 02 asegura · 03 bloquea · 04 desbloquea · 05 saca
   ───────────────────────────────────────────────────────── */

export const STEPS = [
    {
        num: "01",
        title: "Guarda",
        desc: "Cada persona deposita su teléfono en una funda BloKKit al ingresar.",
    },
    {
        num: "02",
        title: "Asegura",
        desc: "Bloquea la funda con el cierre magnético: un clic y queda sellada.",
    },
    {
        num: "03",
        title: "Bloquea",
        desc: "GSM, Bluetooth y WiFi quedan bloqueados. El teléfono nunca cambia de manos.",
    },
    {
        num: "04",
        title: "Desbloquea",
        desc: "Al salir, desbloquea la funda con el dock en menos de 3 segundos.",
    },
    {
        num: "05",
        title: "Saca",
        desc: "Teléfono de vuelta. Sin filas, sin casilleros, sin custodia de terceros.",
    },
];

const HUD_FUNDA = ["ABIERTA", "SELLADA", "SELLADA", "LIBERADA", "ABIERTA"];
const HUD_SENAL = ["ACTIVA", "AISLANDO", "BLOQUEADA", "BLOQUEADA", "ACTIVA"];
const SENAL_BLOCKED = [false, false, true, true, false];

/* Pouch geometry — flat neoprene sleeve, Yondr-like proportions */
const P = {
    x: 181, y: 210, w: 158, h: 390, rx: 40,   // overall closed silhouette
    cx: 260,                                   // scene center
    pinY: 244,                                 // lock pin center (on the front dome)
};

/* ── The animated scene ─────────────────────────────────── */

export function FundaScene({ progress }: { progress: MotionValue<number> }) {
    // The scene renders multiple times (desktop stage + one per mobile card);
    // gradient ids must be unique or url(#...) resolves into a display:none
    // sibling and the fills silently fail.
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const grad = (name: string) => `hiw-${uid}-${name}`;

    /* Phase 1 — phone drops in through the open mouth; Phase 5 — exits */
    const phoneY = useTransform(progress, [0, 0.04, 0.17, 0.82, 0.94], [-225, -225, 0, 0, -225]);
    const screenOn = useTransform(progress, [0.84, 0.91], [0, 1]);

    /* Phase 2 — the two dome halves part symmetrically: the front one
       (with the pin) dips, the back one (curved counterpart that rests
       on the magnet) lifts. They meet again and the pin clicks. The
       pin lives on the front half and never disappears. */
    const mouthOpen = useTransform(progress, [0.22, 0.27, 0.8, 0.84], [1, 0, 0, 1]);
    const frontDomeY = useTransform(mouthOpen, [0, 1], [0, 10]);
    const backDomeY = useTransform(mouthOpen, [0, 1], [0, -24]);
    const clickA = useTransform(progress, [0.27, 0.3, 0.33], [0, 0.7, 0]);
    const clickB = useTransform(progress, [0.29, 0.32, 0.36], [0, 0.5, 0]);
    const sealLen = useTransform(progress, [0.26, 0.42], [0, 1]);
    const sealOpacity = useTransform(progress, [0.26, 0.3, 0.5, 0.6], [0, 0.9, 0.9, 0.2]);

    /* Phase 3 — signal glyphs appear and get struck out, shield traces */
    const signalsIn = useTransform(progress, [0.4, 0.46, 0.78, 0.85], [0, 1, 1, 0]);
    const strikeGsm = useTransform(progress, [0.46, 0.53], [0, 1]);
    const strikeBt = useTransform(progress, [0.5, 0.57], [0, 1]);
    const strikeWifi = useTransform(progress, [0.54, 0.61], [0, 1]);
    const shieldLen = useTransform(progress, [0.44, 0.6], [0, 1]);
    const shieldOpacity = useTransform(progress, [0.44, 0.5, 0.74, 0.8], [0, 1, 1, 0]);

    /* Phase 4 — the padlock-shaped magnet base rises bottom-right and
       the pouch tips over it; the magnet releases THE PIN */
    const dockY = useTransform(progress, [0.6, 0.66], [80, 0]);
    const dockOp = useTransform(progress, [0.6, 0.65, 0.84, 0.88], [0, 1, 1, 0]);
    const pouchTilt = useTransform(progress, [0.64, 0.72, 0.8, 0.85], [0, 10, 10, 0]);
    const pouchDip = useTransform(progress, [0.64, 0.72, 0.8, 0.85], [0, 28, 28, 0]);
    const rippleA = useTransform(progress, [0.7, 0.73, 0.78], [0, 0.6, 0]);
    const rippleB = useTransform(progress, [0.72, 0.75, 0.8], [0, 0.45, 0]);
    const rippleC = useTransform(progress, [0.74, 0.77, 0.82], [0, 0.3, 0]);
    const pinFill = useTransform(progress, [0.72, 0.78], ["#1B1C1E", "#3FA8E0"]);
    const pinPop = useTransform(progress, [0.72, 0.76, 0.8], [0, -3.5, -2]);

    /* Phase 5 — done chip */
    const doneIn = useTransform(progress, [0.88, 0.94], [0, 1]);
    const doneY = useTransform(progress, [0.88, 0.94], [8, 0]);

    return (
        <svg
            className="hiw-svg"
            viewBox="0 0 520 700"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <defs>
                {/* matte neoprene — near-flat, the faintest vertical shading */}
                <linearGradient id={grad("body")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#26272A" />
                    <stop offset="1" stopColor="#1E1F22" />
                </linearGradient>
                <linearGradient id={grad("phone")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4A4E55" />
                    <stop offset="1" stopColor="#33363B" />
                </linearGradient>
                <linearGradient id={grad("screen-on")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#CDEAF5" />
                    <stop offset="1" stopColor="#7FCEEC" />
                </linearGradient>
                <linearGradient id={grad("cyl")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#D6D9DD" />
                    <stop offset="1" stopColor="#8E9196" />
                </linearGradient>
            </defs>

            {/* ground shadow */}
            <ellipse cx="290" cy="622" rx="150" ry="12" fill="#1F1F1F" opacity="0.12" />

            {/* ── shield ring — phase 3 ── */}
            <motion.rect
                x="163" y="192" width="194" height="426" rx="50"
                stroke="#3FA8E0" strokeWidth="2" strokeDasharray="1"
                style={{ pathLength: shieldLen, opacity: shieldOpacity }}
            />

            {/* ── signal chips — phase 3 ── */}
            <motion.g style={{ opacity: signalsIn }}>
                {/* connector hairlines */}
                <line x1="120" y1="278" x2="179" y2="278" stroke="#1F1F1F" strokeOpacity="0.25" strokeDasharray="3 4" />
                <line x1="120" y1="423" x2="179" y2="423" stroke="#1F1F1F" strokeOpacity="0.25" strokeDasharray="3 4" />
                <line x1="400" y1="343" x2="341" y2="343" stroke="#1F1F1F" strokeOpacity="0.25" strokeDasharray="3 4" />

                {/* GSM — left top */}
                <g transform="translate(62 250)">
                    <rect width="58" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.65" stroke="#1F1F1F" strokeOpacity="0.08" />
                    <g transform="translate(15 14)">
                        <rect x="0" y="20" width="5" height="8" rx="1.5" fill="#6B6E73" />
                        <rect x="8" y="14" width="5" height="14" rx="1.5" fill="#6B6E73" />
                        <rect x="16" y="8" width="5" height="20" rx="1.5" fill="#6B6E73" />
                        <rect x="24" y="2" width="5" height="26" rx="1.5" fill="#6B6E73" />
                    </g>
                    <motion.line x1="10" y1="10" x2="48" y2="46" stroke="#FB6E60" strokeWidth="3.5" strokeLinecap="round" style={{ pathLength: strikeGsm }} />
                </g>

                {/* BT — left bottom */}
                <g transform="translate(62 395)">
                    <rect width="58" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.65" stroke="#1F1F1F" strokeOpacity="0.08" />
                    <path d="M24 19 L36 28 L29 33.5 V14.5 L36 20 L24 29" transform="translate(0 4)" stroke="#6B6E73" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <motion.line x1="10" y1="10" x2="48" y2="46" stroke="#FB6E60" strokeWidth="3.5" strokeLinecap="round" style={{ pathLength: strikeBt }} />
                </g>

                {/* WiFi — right */}
                <g transform="translate(402 315)">
                    <rect width="58" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.65" stroke="#1F1F1F" strokeOpacity="0.08" />
                    <g transform="translate(13 16)">
                        <path d="M0 10 a 23 23 0 0 1 32 0" stroke="#6B6E73" strokeWidth="2.4" strokeLinecap="round" />
                        <path d="M5.5 16.5 a 15 15 0 0 1 21 0" stroke="#6B6E73" strokeWidth="2.4" strokeLinecap="round" />
                        <path d="M11 23 a 7 7 0 0 1 10 0" stroke="#6B6E73" strokeWidth="2.4" strokeLinecap="round" />
                        <circle cx="16" cy="27.5" r="1.8" fill="#6B6E73" />
                    </g>
                    <motion.line x1="10" y1="10" x2="48" y2="46" stroke="#FB6E60" strokeWidth="3.5" strokeLinecap="round" style={{ pathLength: strikeWifi }} />
                </g>
            </motion.g>

            {/* ── magnet base — 3D-printed padlock-shaped housing (black,
                   cream print band, lug) with the silver magnet cylinder.
                   Drawn 3/4 like the deck's "ABRE" illustration ── */}
            <motion.g style={{ y: dockY, opacity: dockOp }}>
                {/* padlock lug behind the body */}
                <ellipse cx="292" cy="570" rx="26" ry="11" fill="#232425" />
                <ellipse cx="292" cy="570" rx="9" ry="4" fill="#0F1012" />
                {/* layered puck: bottom black / cream band / top face */}
                <ellipse cx="360" cy="600" rx="85" ry="20" fill="#1B1C1E" />
                <ellipse cx="360" cy="592" rx="85" ry="20" fill="#D8CEB5" />
                <ellipse cx="360" cy="580" rx="85" ry="20" fill="#232425" />
                {/* embossed brand on the cream band */}
                <text x="360" y="601" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="#6B6253">BLOKKIT</text>
                {/* magnet cylinder, ~1/3 of the housing diameter */}
                <ellipse cx="360" cy="582" rx="30" ry="9" fill="#0E0F10" fillOpacity="0.35" />
                <rect x="332" y="540" width="56" height="42" fill={`url(#${grad("cyl")})`} />
                <ellipse cx="360" cy="582" rx="28" ry="8" fill="#8E9196" />
                <ellipse cx="360" cy="540" rx="28" ry="8" fill="#D9DCDF" />
                <ellipse cx="360" cy="540" rx="12" ry="3.5" fill="#9FA3A8" />
            </motion.g>

            {/* ── pouch — tips toward the magnet base in phase 4 ── */}
            <motion.g style={{ rotate: pouchTilt, y: pouchDip, transformBox: "fill-box", transformOrigin: "center" }}>
                {/* back dome half — the curved counterpart that rests on the
                    magnet; same silhouette as the front dome, lifts away */}
                <motion.g style={{ y: backDomeY }}>
                    <path d="M 183 272 L 183 251 Q 183 208 260 208 Q 337 208 337 251 L 337 272 Z" fill="#33363B" />
                    <path d="M 183 272 L 183 251 Q 183 208 260 208 Q 337 208 337 251 L 337 272" stroke="#26282B" strokeWidth="4" />
                    {/* socket of the pin on the back half */}
                    <circle cx={P.cx} cy="240" r="7" fill="#0F1012" />
                    <circle cx={P.cx} cy="240" r="7" stroke="#1D1E20" strokeWidth="2.5" />
                </motion.g>

                {/* phone — painted under the body so it hides inside */}
                <motion.g style={{ y: phoneY }}>
                    <rect x="205" y="230" width="110" height="232" rx="18" fill={`url(#${grad("phone")})`} stroke="#15161A" strokeWidth="1.5" />
                    <rect x="212" y="239" width="96" height="202" rx="13" fill="#101114" />
                    <motion.rect x="212" y="239" width="96" height="202" rx="13" fill={`url(#${grad("screen-on")})`} style={{ opacity: screenOn }} />
                    <circle cx={P.cx} cy="250" r="3" fill="#2E3239" />
                </motion.g>

                {/* body (below the dome seam) — matte black neoprene */}
                <path d="M 181 268 L 181 560 Q 181 600 221 600 L 299 600 Q 339 600 339 560 L 339 268 Z" fill={`url(#${grad("body")})`} />
                {/* binding along sides + bottom (the dome carries its own) */}
                <path d="M 181 268 L 181 560 Q 181 600 221 600 L 299 600 Q 339 600 339 560 L 339 268" stroke="#3A3B3E" strokeWidth="6" />
                <path d="M 181 268 L 181 560 Q 181 600 221 600 L 299 600 Q 339 600 339 560 L 339 268" stroke="#55565A" strokeWidth="1" strokeDasharray="4 3" />
                {/* dome-to-body stitch seam, as on the product */}
                <line x1="195" y1="272" x2="325" y2="272" stroke="#55565A" strokeWidth="1" strokeDasharray="4 3" />

                {/* official BloKKit logo, screen-printed vertically on the
                    lower half of the body */}
                <image
                    href="/images/Logo-Blokkit-white.png"
                    x="170" y="443" width="180" height="54"
                    transform={`translate(5 -10) rotate(-90 260 470)`}
                    opacity="0.95"
                />

                {/* front dome half — dips when the halves part; carries the
                    press-pin, always visible from this view */}
                <motion.g style={{ y: frontDomeY }}>
                    <path d="M 181 272 L 181 250 Q 181 206 260 206 Q 339 206 339 250 L 339 272 Z" fill="#26272A" />
                    <path d="M 181 272 L 181 250 Q 181 206 260 206 Q 339 206 339 250 L 339 272" stroke="#3A3B3E" strokeWidth="6" />
                    <path d="M 181 272 L 181 250 Q 181 206 260 206 Q 339 206 339 250 L 339 272" stroke="#55565A" strokeWidth="1" strokeDasharray="4 3" />
                    {/* opening shadow along the dome edge, visible while parted */}
                    <motion.path d="M 190 254 Q 190 216 260 216 Q 330 216 330 254" stroke="#0E0F11" strokeWidth="3" strokeLinecap="round" style={{ opacity: mouthOpen }} />

                    {/* press-pin: round base + spring-loaded post */}
                    <circle cx={P.cx} cy="248" r="12" fill="#141517" />
                    <circle cx={P.cx} cy="248" r="12" stroke="#000000" strokeOpacity="0.4" />
                    <motion.g style={{ y: pinPop }}>
                        <rect x="256" y="232" width="8" height="12" rx="2.5" fill="#1B1C1E" />
                        <motion.circle cx={P.cx} cy="232" r="8" style={{ fill: pinFill }} />
                        <ellipse cx="258" cy="229.5" rx="3" ry="2" fill="#FFFFFF" fillOpacity="0.14" />
                    </motion.g>
                </motion.g>

                {/* magnetic seal trace — phase 2, follows the closed outline */}
                <motion.path
                    d="M 260 206 Q 339 206 339 250 L 339 560 Q 339 600 299 600 L 221 600 Q 181 600 181 560 L 181 250 Q 181 206 260 206 Z"
                    stroke="#7FCEEC" strokeWidth="3" strokeDasharray="1"
                    style={{ pathLength: sealLen, opacity: sealOpacity }}
                />

                {/* click rings at the pin — phase 2 */}
                <motion.circle cx={P.cx} cy={P.pinY} r="16" stroke="#7FCEEC" strokeWidth="1.5" style={{ opacity: clickA }} />
                <motion.circle cx={P.cx} cy={P.pinY} r="24" stroke="#7FCEEC" strokeWidth="1" style={{ opacity: clickB }} />

                {/* unlock ripples at the pin — phase 4 (the magnet acts on the pin) */}
                <motion.circle cx={P.cx} cy={P.pinY} r="16" stroke="#3FA8E0" strokeWidth="1.5" style={{ opacity: rippleA }} />
                <motion.circle cx={P.cx} cy={P.pinY} r="26" stroke="#3FA8E0" strokeWidth="1.2" style={{ opacity: rippleB }} />
                <motion.circle cx={P.cx} cy={P.pinY} r="38" stroke="#3FA8E0" strokeWidth="1" style={{ opacity: rippleC }} />
            </motion.g>

            {/* ── done chip — phase 5 ── */}
            <motion.g style={{ opacity: doneIn, y: doneY }}>
                <rect x="318" y="64" width="92" height="34" rx="17" fill="#FFFFFF" fillOpacity="0.75" stroke="#1F1F1F" strokeOpacity="0.08" />
                <circle cx="338" cy="81" r="9" fill="#3FA8E0" />
                <path d="M334 81 l3 3 l6 -6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <text x="354" y="85" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="1.5" fill="#1F1F1F">LISTO</text>
            </motion.g>
        </svg>
    );
}

/* ── HUD readout (device-style status) ──────────────────── */

export function Hud({ phase }: { phase: number }) {
    return (
        <div className="hiw-hud" aria-hidden="true">
            <span className="hiw-hud-title">ESTADO</span>
            <div className="hiw-hud-row">
                <span>FUNDA</span>
                <motion.span
                    key={`f-${phase}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="hiw-hud-val"
                >{HUD_FUNDA[phase]}</motion.span>
            </div>
            <div className="hiw-hud-row">
                <span>SEÑAL</span>
                <motion.span
                    key={`s-${phase}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`hiw-hud-val ${SENAL_BLOCKED[phase] ? "hiw-hud-val--blocked" : ""}`}
                >{HUD_SENAL[phase]}</motion.span>
            </div>
        </div>
    );
}

function SectionHead() {
    return (
        <header className="hiw-head">
            <span className="hiw-label">· Operación simple</span>
            <h2 className="hiw-heading">
                Cómo funciona
                <em>en 5 segundos</em>
            </h2>
            <p className="hiw-lead">
                Un flujo único para cada organización: rápido, visible y fácil de
                supervisar de principio a fin.
            </p>
        </header>
    );
}

/* ── Desktop: pinned scroll stage ───────────────────────── */

function DesktopStage() {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [phase, setPhase] = useState(0);
    const { scrollYProgress } = useScroll({
        target: wrapRef,
        offset: ["start start", "end end"],
    });

    useMotionValueEvent(scrollYProgress, "change", (v) => {
        const idx = Math.min(4, Math.max(0, Math.floor(v * 5)));
        setPhase((prev) => (prev === idx ? prev : idx));
    });

    const spineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

    const goTo = (i: number) => {
        const el = wrapRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        const travel = el.offsetHeight - window.innerHeight;
        window.scrollTo({ top: top + (i / 5) * travel + travel * 0.02, behavior: "smooth" });
    };

    return (
        <div className="hiw-desktop">
            <div className="hiw-pin-wrap" ref={wrapRef}>
                <div className="hiw-stage">
                    <div className="hiw-rail">
                        <SectionHead />
                        <div className="hiw-steps">
                            <div className="hiw-spine" aria-hidden="true">
                                <motion.div className="hiw-spine-fill" style={{ scaleY: spineScale }} />
                            </div>
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
                    </div>
                    <div className="hiw-scene">
                        <FundaScene progress={scrollYProgress} />
                        <Hud phase={phase} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Mobile / reduced-motion: stacked steps ─────────────── */

function MobileStep({ index }: { index: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-12% 0px" });
    const reduced = useReducedMotion();
    // Each card animates its own fifth of the shared timeline,
    // starting where the previous step left off.
    const progress = useMotionValue(index / 5);

    useEffect(() => {
        if (!inView) return;
        const end = (index + 1) / 5 - 0.004;
        if (reduced) {
            progress.set(end);
            return;
        }
        const controls = animate(progress, end, {
            duration: 1.5,
            delay: 0.2,
            ease: [0.65, 0, 0.35, 1],
        });
        return () => controls.stop();
    }, [inView, reduced, index, progress]);

    const s = STEPS[index];
    return (
        <div className="hiw-mcard" ref={ref}>
            <div className="hiw-mcard-text">
                <span className="hiw-step-num">{s.num}</span>
                <h3 className="hiw-step-title">{s.title}</h3>
                <p className="hiw-step-desc">{s.desc}</p>
            </div>
            <div className="hiw-mcard-scene">
                <FundaScene progress={progress} />
            </div>
        </div>
    );
}

export default function HowItWorksScroll() {
    return (
        <div className="hiw">
            <DesktopStage />
            <div className="hiw-mobile">
                <SectionHead />
                {STEPS.map((_, i) => (
                    <MobileStep key={i} index={i} />
                ))}
            </div>
        </div>
    );
}
