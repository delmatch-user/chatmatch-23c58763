import { useState, useEffect, type ReactNode } from 'react';
import { useCountUp } from '@/hooks/useCountUp';

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  delay?: number;
  color?: 'primary' | 'success' | 'warning';
  isNumber?: boolean;
  suffix?: string;
  prefix?: string;
}

export function StatCard({
  icon,
  value,
  label,
  delay = 0,
  color = 'primary',
  isNumber = false,
  suffix = '',
  prefix = '',
}: StatCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; animDelay: number }>>([]);

  const numericValue = isNumber && typeof value === 'number' ? value : 0;
  const { count } = useCountUp({
    end: numericValue,
    duration: 2000,
    delay: delay * 1000 + 300,
    startOnMount: isNumber,
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      animDelay: Math.random() * 0.8,
    }));
    setParticles(newParticles);
  }, []);

  const colorClasses = {
    primary: {
      border: 'hover:border-primary/50',
      shadow: 'hover:shadow-primary/10',
      bg: 'from-primary/5',
      glow: 'bg-primary/10',
      iconBg: 'bg-primary/10 border-primary/20 group-hover:bg-primary/20',
      iconColor: 'text-primary',
      textHover: 'group-hover:text-primary',
      particle: 'bg-primary',
    },
    success: {
      border: 'hover:border-success/50',
      shadow: 'hover:shadow-success/10',
      bg: 'from-success/5',
      glow: 'bg-success/10',
      iconBg: 'bg-success/10 border-success/20 group-hover:bg-success/20',
      iconColor: 'text-success',
      textHover: 'group-hover:text-success',
      particle: 'bg-success',
    },
    warning: {
      border: 'hover:border-warning/50',
      shadow: 'hover:shadow-warning/10',
      bg: 'from-warning/5',
      glow: 'bg-warning/10',
      iconBg: 'bg-warning/10 border-warning/20 group-hover:bg-warning/20',
      iconColor: 'text-warning',
      textHover: 'group-hover:text-warning',
      particle: 'bg-warning',
    },
  };

  const classes = colorClasses[color];
  const displayValue = isNumber ? `${prefix}${count}${suffix}` : value;

  return (
    <div
      className={`group relative p-4 rounded-2xl bg-card/50 border border-border backdrop-blur-sm overflow-hidden cursor-pointer transition-all duration-500 hover:bg-card ${classes.border} hover:shadow-lg ${classes.shadow} hover:-translate-y-1 ${
        isVisible ? 'animate-fade-in opacity-100' : 'opacity-0'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${classes.bg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Glow effect */}
      <div className={`absolute -top-12 -right-12 w-24 h-24 ${classes.glow} rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-150`} />

      {/* Floating particles on hover */}
      {isHovered && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className={`absolute rounded-full ${classes.particle} animate-particle-rise`}
              style={{
                left: `${particle.x}%`,
                bottom: '-10%',
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: `${particle.animDelay}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className={`w-10 h-10 rounded-xl ${classes.iconBg} border flex items-center justify-center mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
          <div className={classes.iconColor}>{icon}</div>
        </div>
        <p className={`text-2xl font-bold text-foreground ${classes.textHover} transition-colors duration-300 tabular-nums`}>
          {displayValue}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}
