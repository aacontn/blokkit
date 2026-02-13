import type {CSSProperties, ReactNode} from 'react';

const sceneStyle: CSSProperties = {
  position: 'relative',
  width: '109%',
  aspectRatio: '1 / 1',
  marginLeft: '-4.5%',
  marginTop: '0%',
};

const ringStyle: CSSProperties = {
  position: 'absolute',
  inset: '15%',
  borderRadius: '50%',
  border: '1px solid rgba(0, 194, 209, 0.28)',
  pointerEvents: 'none',
};

const chipBase: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '13px 15px',
  borderRadius: 15,
  height: 106,
  width: 252,
  background: 'rgba(6, 10, 20, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 20px 45px rgba(0, 0, 0, 0.38)',
  backdropFilter: 'blur(10px)',
  zIndex: 4,
};

const iconBadge: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255, 255, 255, 0.09)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  color: '#e2f9ff',
};

const iconSvg: CSSProperties = {
  width: 15,
  height: 15,
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const chipTitleStyle: CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif',
  fontSize: 19.5,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  color: '#fff',
  textShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
};

const chipLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  color: 'rgba(255, 255, 255, 0.75)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const BlockedIcon = ({children}: {children: ReactNode}) => {
  return (
    <span
      style={{
        ...iconBadge,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(132deg, transparent 42%, rgba(239, 68, 68, 0.08) 43%, rgba(239, 68, 68, 0.08) 57%, transparent 58%)',
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: 36,
          height: 1.5,
          background: 'rgba(239, 68, 68, 0.52)',
          transform: 'rotate(-38deg)',
          boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.04)',
        }}
      />
      {children}
    </span>
  );
};

const CellularIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <path d="M5 19v-2" />
    <path d="M9 19v-5" />
    <path d="M13 19v-8" />
    <path d="M17 19V8" />
  </svg>
);

const BluetoothIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <path d="M7 7l10 10-5 4V3l5 4L7 17" />
  </svg>
);

const WifiIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <path d="M2.4 9.2a15 15 0 0 1 19.2 0" />
    <path d="M5.2 12.8a10 10 0 0 1 13.6 0" />
    <path d="M8.8 16.2a5 5 0 0 1 6.4 0" />
    <circle cx="12" cy="19.3" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="11" rx="2" />
    <path d="M10 20h4" />
    <path d="M8 15.5l2.4-2.2 2.2 2.2 3.4-3.4" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <rect x="6.5" y="10" width="11" height="9" rx="2" />
    <path d="M9 10V8a3 3 0 0 1 6 0v2" />
  </svg>
);

const AiIcon = () => (
  <svg viewBox="0 0 24 24" style={iconSvg} aria-hidden="true">
    <rect x="5" y="7" width="14" height="10" rx="2" />
    <path d="M12 4v3M8 17v2M16 17v2M3 12h2M19 12h2" />
    <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export default function HeroMotionVisual() {
  return (
    <>
      <div className="hero-motion-scene" style={sceneStyle} aria-hidden="true">
        <div
          className="hero-motion-glow"
          style={{
            position: 'absolute',
            inset: '8%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(0, 194, 209, 0.5) 0%, rgba(0, 194, 209, 0.2) 32%, rgba(0, 194, 209, 0) 68%)',
            filter: 'blur(10px)',
            animation: 'heroGlow 4.2s ease-in-out infinite',
          }}
        />

        {[0, 0.6, 1.2].map((delay, index) => (
          <div
            key={index}
            className="hero-motion-ring"
            style={{
              ...ringStyle,
              animation: `heroRing 4s linear ${delay}s infinite`,
            }}
          />
        ))}

        <img
          src="/images/blokkit-fundas.png"
          alt="Fundas BloKKit"
          className="hero-motion-product"
          style={{
            position: 'absolute',
            inset: 0,
            margin: 'auto',
            width: '96%',
            maxWidth: 1040,
            objectFit: 'contain',
            filter: 'drop-shadow(0 24px 50px rgba(0, 0, 0, 0.36))',
            zIndex: 3,
            willChange: 'transform',
            animation: 'heroProductFloat 5.6s ease-in-out infinite',
          }}
        />

        <div
          style={{
            ...chipBase,
            top: '9%',
            left: '1%',
          }}
        >
          <span style={{display: 'inline-flex', gap: 7, alignItems: 'center'}}>
            <BlockedIcon>
              <CellularIcon />
            </BlockedIcon>
            <BlockedIcon>
              <BluetoothIcon />
            </BlockedIcon>
            <BlockedIcon>
              <WifiIcon />
            </BlockedIcon>
          </span>
          <span style={chipTitleStyle}>GSM · BT · WiFi</span>
          <span style={chipLabelStyle}>Bloqueo efectivo</span>
        </div>

        <div
          style={{
            ...chipBase,
            right: '1%',
            top: '44%',
          }}
        >
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
            <span style={iconBadge}>
              <MonitorIcon />
            </span>
          </span>
          <span style={chipTitleStyle}>Plataforma</span>
          <span style={chipLabelStyle}>Medicion y trazabilidad</span>
        </div>

        <div
          style={{
            ...chipBase,
            left: '3%',
            bottom: '22%',
          }}
        >
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
            <span style={iconBadge}>
              <LockIcon />
            </span>
            <span style={iconBadge}>
              <AiIcon />
            </span>
          </span>
          <span style={chipTitleStyle}>Desbloqueo</span>
          <span style={chipLabelStyle}>Manual o Smart</span>
        </div>
      </div>

      <style>{`
        .hero-motion-scene {
          overflow: visible;
        }

        @keyframes heroGlow {
          0%, 100% { opacity: 0.26; transform: scale(0.97); }
          50% { opacity: 0.55; transform: scale(1.03); }
        }

        @keyframes heroRing {
          0% { transform: scale(0.84); opacity: 0; }
          50% { opacity: 0.28; }
          100% { transform: scale(1.2); opacity: 0; }
        }

        @keyframes heroProductFloat {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          25% { transform: translate3d(4px, -14px, 0) scale(1.01); }
          50% { transform: translate3d(0, 0, 0) scale(1); }
          75% { transform: translate3d(-4px, 14px, 0) scale(0.995); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }

        @media (max-width: 768px) {
          .hero-motion-scene {
            width: 92% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 2% !important;
          }

          .hero-motion-product {
            width: 86% !important;
          }

          .hero-motion-ring {
            inset: 17% !important;
          }

          .hero-motion-glow {
            inset: 11% !important;
          }
        }

      `}</style>
    </>
  );
}
