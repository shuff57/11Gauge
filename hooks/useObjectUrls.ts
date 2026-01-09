import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing object URLs with automatic cleanup
 * Prevents memory leaks by revoking URLs on unmount or when URLs change
 */
export const useObjectUrls = () => {
  const [urls, setUrls] = useState<string[]>([]);

  // Cleanup function to revoke all URLs
  const revokeAll = useCallback(() => {
    urls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn('Failed to revoke object URL:', err);
      }
    });
  }, [urls]);

  // Create object URLs from files
  const createUrls = useCallback((files: File[]) => {
    // First, revoke existing URLs
    revokeAll();

    // Then create new URLs
    const newUrls = files.map(file => URL.createObjectURL(file));
    setUrls(newUrls);

    return newUrls;
  }, [revokeAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      urls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (err) {
          // Ignore errors during cleanup
        }
      });
    };
  }, [urls]);

  return {
    urls,
    createUrls,
    revokeAll
  };
};
