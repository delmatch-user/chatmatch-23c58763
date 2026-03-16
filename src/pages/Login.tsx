import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Zap, Shield, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { StatCard } from '@/components/login/StatCard';
import { AnimatedBackground } from '@/components/login/AnimatedBackground';
export default function Login() {
  const navigate = useNavigate();
  const {
    user,
    isLoading,
    isFranqueado,
    signIn
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      navigate(isFranqueado ? '/franqueado' : '/fila');
    }
  }, [user, isLoading, isFranqueado, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }
    setIsSubmitting(true);
    const {
      error
    } = await signIn(email, password);
    if (error) {
      let message = 'Erro ao fazer login';
      if (error.message?.includes('Invalid login credentials')) {
        message = 'Email ou senha incorretos';
      } else if (error.message?.includes('Email not confirmed')) {
        message = 'Email não confirmado. Verifique sua caixa de entrada.';
      }
      toast.error(message);
      setIsSubmitting(false);
      return;
    }
    toast.success('Login realizado com sucesso!');
    navigate('/fila');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex relative overflow-hidden bg-background">
      {/* Interactive Animated Background */}
      <AnimatedBackground />

      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] xl:w-3/5 relative z-10">
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 w-full py-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded-2xl blur-lg opacity-40" />
              <div className="relative w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Match Conversa
              </h1>
              <p className="text-muted-foreground text-xs tracking-wide">Atendimento Inteligente</p>
            </div>
          </div>
          
          <div className="space-y-6 max-w-lg">
            <div className="space-y-4">
              <h2 className="text-4xl xl:text-5xl font-bold leading-tight">
                <span className="text-foreground">
                  Atendimento do
                </span>
                <br />
                <span className="text-primary">
                  Futuro
                </span>
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
                Unifique conversas, automatize processos e ofereça experiências 
                excepcionais com inteligência artificial de ponta.
              </p>
            </div>
            
            {/* Feature Cards */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              <StatCard
                icon={<Zap className="w-6 h-6" />}
                value={50}
                label="Conversas/mês"
                delay={0.1}
                color="primary"
                isNumber
                prefix="+"
                suffix="k"
              />
              
              <StatCard
                icon={<Shield className="w-6 h-6" />}
                value={98}
                label="Satisfação"
                delay={0.2}
                color="success"
                isNumber
                suffix="%"
              />
              
              <StatCard
                icon={<Globe className="w-6 h-6" />}
                value="24/7"
                label="Disponível"
                delay={0.3}
                color="success"
              />
              
              <StatCard
                icon={<Sparkles className="w-6 h-6" />}
                value="IA"
                label="Inteligente"
                delay={0.4}
                color="warning"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded-2xl blur-lg opacity-40" />
              <div className="relative w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
            <span className="text-2xl font-bold text-foreground">
              Match Conversa
            </span>
          </div>

          {/* Login Card */}
          <div className="relative">
            {/* Card Glow */}
            <div className="absolute -inset-1 bg-primary/10 rounded-3xl blur-xl opacity-50" />
            
            <div className="relative p-8 sm:p-10 rounded-3xl bg-card/80 border border-border backdrop-blur-xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">Bem-vindo de volta</h2>
                <p className="text-muted-foreground">Entre com suas credenciais para acessar</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-primary/10 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="seu@email.com" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="pl-12 h-14 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground rounded-xl focus:border-primary/50 focus:bg-secondary transition-all" 
                        required 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-muted-foreground">Senha</Label>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-primary/10 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="password" 
                        type={showPassword ? 'text' : 'password'} 
                        placeholder="••••••••" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="pl-12 pr-12 h-14 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground rounded-xl focus:border-primary/50 focus:bg-secondary transition-all" 
                        required 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)} 
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 text-base font-semibold rounded-xl gradient-primary hover:opacity-90 transition-all shadow-lg shadow-primary/25 mt-8" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Entrando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Entrar na plataforma
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-border">
                <p className="text-center text-sm text-muted-foreground">
                  Não tem uma conta?{' '}
                  <span className="text-primary font-medium hover:text-primary/80 cursor-pointer transition-colors">
                    Fale com o administrador
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Text */}
          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            © 2026 Match Conversa. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
