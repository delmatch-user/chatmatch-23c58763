import { useEffect, useRef, useState } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

interface MousePosition {
  x: number;
  y: number;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<MousePosition>({ x: 0, y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Initialize particles
    const particleCount = Math.min(80, Math.floor((dimensions.width * dimensions.height) / 15000));
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * dimensions.width,
      y: Math.random() * dimensions.height,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.2,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.01,
    }));

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get CSS variable for primary color (orange)
      const primaryColor = '24, 100%, 50%'; // HSL values for orange

      // Draw grid with subtle animation
      const time = Date.now() * 0.0001;
      ctx.strokeStyle = `hsla(${primaryColor}, 0.03)`;
      ctx.lineWidth = 1;
      
      const gridSize = 60;
      const offsetX = (time * 20) % gridSize;
      const offsetY = (time * 10) % gridSize;

      for (let x = -gridSize + offsetX; x < canvas.width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = -gridSize + offsetY; y < canvas.height + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw and update particles
      particlesRef.current.forEach((particle, index) => {
        // Mouse interaction
        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 200;

        if (distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance;
          particle.speedX -= (dx / distance) * force * 0.02;
          particle.speedY -= (dy / distance) * force * 0.02;
        }

        // Update position
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        particle.pulse += particle.pulseSpeed;

        // Bounce off edges
        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;

        // Keep in bounds
        particle.x = Math.max(0, Math.min(canvas.width, particle.x));
        particle.y = Math.max(0, Math.min(canvas.height, particle.y));

        // Damping
        particle.speedX *= 0.99;
        particle.speedY *= 0.99;

        // Add minimum speed
        if (Math.abs(particle.speedX) < 0.1) particle.speedX = (Math.random() - 0.5) * 0.3;
        if (Math.abs(particle.speedY) < 0.1) particle.speedY = (Math.random() - 0.5) * 0.3;

        // Pulsing opacity
        const pulseOpacity = particle.opacity * (0.7 + Math.sin(particle.pulse) * 0.3);

        // Draw particle with glow
        const glowSize = particle.size * (2 + Math.sin(particle.pulse) * 0.5);
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, glowSize * 3
        );
        gradient.addColorStop(0, `hsla(${primaryColor}, ${pulseOpacity})`);
        gradient.addColorStop(0.5, `hsla(${primaryColor}, ${pulseOpacity * 0.3})`);
        gradient.addColorStop(1, `hsla(${primaryColor}, 0)`);

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, glowSize * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw connections
        particlesRef.current.slice(index + 1).forEach((other) => {
          const dx = other.x - particle.x;
          const dy = other.y - particle.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 150) {
            const opacity = (1 - dist / 150) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `hsla(${primaryColor}, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      // Draw mouse trail effect
      if (mouseRef.current.x > 0 && mouseRef.current.y > 0) {
        const gradient = ctx.createRadialGradient(
          mouseRef.current.x, mouseRef.current.y, 0,
          mouseRef.current.x, mouseRef.current.y, 150
        );
        gradient.addColorStop(0, `hsla(${primaryColor}, 0.15)`);
        gradient.addColorStop(0.5, `hsla(${primaryColor}, 0.05)`);
        gradient.addColorStop(1, `hsla(${primaryColor}, 0)`);

        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 150, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationRef.current);
    };
  }, [dimensions]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20" />
      
      {/* Animated orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] rounded-full bg-gradient-to-r from-primary/25 via-primary/15 to-transparent blur-[120px] animate-pulse-slow" />
      <div 
        className="absolute bottom-[-30%] right-[-15%] w-[600px] h-[600px] rounded-full bg-gradient-to-l from-primary/20 via-primary/10 to-transparent blur-[100px] animate-pulse-slow"
        style={{ animationDelay: '1.5s' }}
      />
      <div 
        className="absolute top-[30%] right-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-accent/15 via-primary/10 to-transparent blur-[80px] animate-pulse-slow"
        style={{ animationDelay: '3s' }}
      />
      <div 
        className="absolute bottom-[20%] left-[5%] w-[300px] h-[300px] rounded-full bg-gradient-to-tr from-primary/15 to-transparent blur-[60px] animate-pulse-slow"
        style={{ animationDelay: '2s' }}
      />

      {/* Interactive canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Scanline effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground) / 0.03) 2px, hsl(var(--foreground) / 0.03) 4px)',
        }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background)/0.4)_100%)]" />
    </div>
  );
}
