import { X } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;      // scrollable content
  footer?: ReactNode;       // actions right-aligned
  maxWidthClass?: string;   // optional size override
};

export default function ModalFormShell({
  open, onClose, title, children, footer,
  maxWidthClass = "sm:max-w-lg",
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent){ if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={onClose}
          />
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            role="dialog" aria-modal="true"
            className={`relative w-full ${maxWidthClass} bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border dark:border-zinc-800 flex flex-col max-h-[92vh]`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b dark:border-zinc-800 flex-shrink-0">
              <h2 className="text-lg font-semibold text-text">{title}</h2>
              <button aria-label="Close" onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"><X className="h-5 w-5"/></button>
            </div>

            {/* Body (ONLY scroll area) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="shrink-0 border-t dark:border-zinc-800 px-5 py-3 flex items-center justify-end gap-3
                              pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
