import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  end: number;
  duration?: number;
  delay?: number;
  startOnMount?: boolean;
}

export function useCountUp({
  end,
  duration = 2000,
  delay = 0,
  startOnMount = true,
}: UseCountUpOptions) {
  const [count, setCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startAnimation = () => {
    setCount(0);
    setIsComplete(false);
    startTimeRef.current = null;

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutExpo)
      const easeOutExpo = 1 - Math.pow(2, -10 * progress);
      const currentCount = Math.floor(easeOutExpo * end);

      setCount(currentCount);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
        setIsComplete(true);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (startOnMount) {
      const timeoutId = setTimeout(startAnimation, delay);
      return () => {
        clearTimeout(timeoutId);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [end, duration, delay, startOnMount]);

  return { count, isComplete, startAnimation };
}
