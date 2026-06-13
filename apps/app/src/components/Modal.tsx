import { ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** acción opcional a la derecha del título (ej. estado, badge) */
  headerAside?: ReactNode;
  /** ancho máximo del panel; default ancho de trabajo */
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/**
 * Modal centrado de marca. Reemplaza los paneles que se desplegaban
 * hacia abajo: aquí el trabajo ocurre en una ventana enfocada sobre la
 * página, con backdrop, scroll interno, cierre por Escape / clic afuera / X
 * y bloqueo del scroll de fondo.
 */
export default function Modal({ open, onClose, title, headerAside, size = "lg", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm sm:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`glass w-full ${SIZES[size]} animate-[modalIn_0.18s_ease-out] p-0`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-7 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg uppercase text-white">{title}</h2>
            {headerAside}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-coral/60 hover:text-coral"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-7 py-6">{children}</div>
      </div>
    </div>
  );
}
