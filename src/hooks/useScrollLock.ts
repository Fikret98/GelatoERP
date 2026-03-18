import { useEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal or overlay is open.
 * @param lock - Boolean to determine if scrolling should be locked.
 */
export function useScrollLock(lock: boolean) {
  useEffect(() => {
    if (lock) {
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = 'var(--scrollbar-width, 0px)';
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [lock]);
}
