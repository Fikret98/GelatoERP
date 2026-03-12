import { useEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal or overlay is open.
 * @param lock - Boolean to determine if scrolling should be locked.
 */
export function useScrollLock(lock: boolean) {
  useEffect(() => {
    if (lock) {
      // Get the current scroll position to prevent jumps
      const scrollY = window.scrollY;
      
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll'; // Maintain scrollbar to prevent layout shift
    } else {
      const scrollY = document.body.style.top;
      
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
    };
  }, [lock]);
}
