import { useState, useCallback, useEffect } from 'react';
import useAppStore from '../store/useAppStore';
import type { ToastState, ToastSeverity } from '../types/store';

export interface UseToastResult {
  toast: ToastState;
  toastProgress: number;
  showToast: (message: string, severity?: ToastSeverity) => void;
  handleCloseToast: () => void;
}

/**
 * 🍞 Global toast hook - uses Zustand store for centralized notifications
 *
 * All components share the SAME toast state, preventing duplicate toasts.
 * Progress bar animation is handled locally for performance.
 *
 * @example
 *   const { toast, toastProgress, showToast, handleCloseToast } = useToast();
 *   showToast('Update completed!', 'success');
 *   showToast('Connection failed', 'error');
 */
export function useToast(): UseToastResult {
  // 🎯 Global toast state from Zustand store
  const toast = useAppStore(state => state.toast);
  const showToastAction = useAppStore(state => state.showToast);
  const hideToastAction = useAppStore(state => state.hideToast);

  // 📊 Progress bar state (local, for animation performance)
  const [toastProgress, setToastProgress] = useState<number>(100);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = 'info'): void => {
      showToastAction(message, severity);
      setToastProgress(100); // Reset progress on new toast
    },
    [showToastAction]
  );

  const handleCloseToast = useCallback((): void => {
    hideToastAction();
    setToastProgress(100);
  }, [hideToastAction]);

  // ✅ Progress bar animation using requestAnimationFrame
  useEffect(() => {
    if (!toast.open) {
      setToastProgress(100);
      return;
    }

    setToastProgress(100);
    const duration = 3500; // Matches autoHideDuration
    const startTime = performance.now();

    let animationId: number | null = null;

    const animate = (): void => {
      const elapsed = performance.now() - startTime;
      const progress = Math.max(0, 100 - (elapsed / duration) * 100);

      setToastProgress(progress);

      if (progress > 0 && elapsed < duration) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [toast.open, toast.message]); // Re-run animation on new message too

  return {
    toast,
    toastProgress,
    showToast,
    handleCloseToast,
  };
}
