import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Settings2, Clock, Scale, Calculator, Save, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RankingConfig {
  id?: string;
  department_id: string;
  is_active: boolean;
  conversations_goal_daily: number;
  conversations_goal_weekly: number;
  conversations_goal_monthly: number;
  tma_green_limit: number;
  tma_yellow_limit: number;
  tme_green_limit: number;
  tme_yellow_limit: number;
  weight_conversations: number;
  weight_tma: number;
  weight_tme: number;
}

const defaultConfig: Omit<RankingConfig, 'department_id'> = {
  is_active: true,
  conversations_goal_daily: 15,
  conversations_goal_weekly: 75,
  conversations_goal_monthly: 300,
  tma_green_limit: 10,
  tma_yellow_limit: 30,
  tme_green_limit: 10,
  tme_yellow_limit: 30,
  weight_conversations: 50,
  weight_tma: 30,
  weight_tme: 20,
};

export default function AdminRankingConfig() {
  const { departments } = useApp();
  const [config, setConfig] = useState<RankingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Encontrar o departamento "Suporte"
  const suporteDept = departments.find(d => d.name.toLowerCase() === 'suporte');

  useEffect(() => {
    if (suporteDept) {
      fetchConfig();
    } else {
      setLoading(false);
    }
  }, [suporteDept]);

  const fetchConfig = async () => {
    if (!suporteDept) return;
    
    try {
      const { data, error } = await supabase
        .from('ranking_config')
        .select('*')
        .eq('department_id', suporteDept.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data as RankingConfig);
      } else {
        // Usar configurações padrão
        setConfig({
          ...defaultConfig,
          department_id: suporteDept.id,
        });
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config || !suporteDept) return;

    // Validar pesos
    const totalWeight = config.weight_conversations + config.weight_tma + config.weight_tme;
    if (totalWeight !== 100) {
      toast.error('A soma dos pesos deve ser igual a 100%');
      return;
    }

    // Validar limites de tempo
    if (config.tma_green_limit < 1 || config.tma_yellow_limit < 1 || 
        config.tme_green_limit < 1 || config.tme_yellow_limit < 1) {
      toast.error('Os limites de tempo devem ser maiores que 0');
      return;
    }

    setSaving(true);
    try {
      if (config.id) {
        // Update existing
        const { error } = await supabase
          .from('ranking_config')
          .update({
            is_active: config.is_active,
            conversations_goal_daily: config.conversations_goal_daily,
            conversations_goal_weekly: config.conversations_goal_weekly,
            conversations_goal_monthly: config.conversations_goal_monthly,
            tma_green_limit: config.tma_green_limit,
            tma_yellow_limit: config.tma_yellow_limit,
            tme_green_limit: config.tme_green_limit,
            tme_yellow_limit: config.tme_yellow_limit,
            weight_conversations: config.weight_conversations,
            weight_tma: config.weight_tma,
            weight_tme: config.weight_tme,
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('ranking_config')
          .insert({
            department_id: suporteDept.id,
            is_active: config.is_active,
            conversations_goal_daily: config.conversations_goal_daily,
            conversations_goal_weekly: config.conversations_goal_weekly,
            conversations_goal_monthly: config.conversations_goal_monthly,
            tma_green_limit: config.tma_green_limit,
            tma_yellow_limit: config.tma_yellow_limit,
            tme_green_limit: config.tme_green_limit,
            tme_yellow_limit: config.tme_yellow_limit,
            weight_conversations: config.weight_conversations,
            weight_tma: config.weight_tma,
            weight_tme: config.weight_tme,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(data as RankingConfig);
      }

      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: keyof RankingConfig, value: number) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const totalWeight = config 
    ? config.weight_conversations + config.weight_tma + config.weight_tme 
    : 100;

  // Exemplo de cálculo de pontuação
  const exampleScore = config ? (
    (80 * config.weight_conversations / 100) +
    (90 * config.weight_tma / 100) +
    (85 * config.weight_tme / 100)
  ).toFixed(0) : 0;

  if (!suporteDept) {
    return (
      <MainLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Departamento "Suporte" não encontrado. Crie um departamento com esse nome para configurar o ranking.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Configuração do Ranking</h1>
              <p className="text-sm text-muted-foreground">
                Configure as metas e métricas para o ranking do departamento Suporte
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {config && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.is_active}
                  onCheckedChange={(checked) => updateConfig('is_active', checked as any)}
                />
                <span className={`text-sm font-medium ${config.is_active ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {config.is_active ? 'Ranking Ativo' : 'Ranking Inativo'}
                </span>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving || totalWeight !== 100}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : config ? (
          <div className="space-y-6">
            {/* Limites de Tempo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-primary" />
                  Limites de Tempo (minutos)
                </CardTitle>
                <CardDescription>
                  Configure os limites para as cores verde, amarelo e vermelho
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* TMA */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Tempo Médio de Atendimento (TMA)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tma-green" className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        Limite Verde (até)
                      </Label>
                      <Input
                        id="tma-green"
                        type="number"
                        min={1}
                        value={config.tma_green_limit}
                        onChange={(e) => updateConfig('tma_green_limit', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tma-yellow" className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        Limite Amarelo (até)
                      </Label>
                      <Input
                        id="tma-yellow"
                        type="number"
                        min={1}
                        value={config.tma_yellow_limit}
                        onChange={(e) => updateConfig('tma_yellow_limit', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    🟢 Até {config.tma_green_limit}m | 🟡 {config.tma_green_limit}-{config.tma_yellow_limit}m | 🔴 Acima de {config.tma_yellow_limit}m
                  </p>
                </div>

                {/* TME */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Tempo Médio de Espera (TME)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tme-green" className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        Limite Verde (até)
                      </Label>
                      <Input
                        id="tme-green"
                        type="number"
                        min={1}
                        value={config.tme_green_limit}
                        onChange={(e) => updateConfig('tme_green_limit', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tme-yellow" className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        Limite Amarelo (até)
                      </Label>
                      <Input
                        id="tme-yellow"
                        type="number"
                        min={1}
                        value={config.tme_yellow_limit}
                        onChange={(e) => updateConfig('tme_yellow_limit', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    🟢 Até {config.tme_green_limit}m | 🟡 {config.tme_green_limit}-{config.tme_yellow_limit}m | 🔴 Acima de {config.tme_yellow_limit}m
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pesos das Métricas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Scale className="w-5 h-5 text-primary" />
                  Peso das Métricas
                </CardTitle>
                <CardDescription>
                  Defina o peso de cada métrica no cálculo da pontuação final (deve somar 100%)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Conversas */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Conversas</Label>
                    <span className="text-sm font-bold text-primary">{config.weight_conversations}%</span>
                  </div>
                  <Slider
                    value={[config.weight_conversations]}
                    onValueChange={([value]) => updateConfig('weight_conversations', value)}
                    max={100}
                    min={0}
                    step={5}
                    className="w-full"
                  />
                </div>

                {/* TMA */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tempo Médio de Atendimento (TMA)</Label>
                    <span className="text-sm font-bold text-primary">{config.weight_tma}%</span>
                  </div>
                  <Slider
                    value={[config.weight_tma]}
                    onValueChange={([value]) => updateConfig('weight_tma', value)}
                    max={100}
                    min={0}
                    step={5}
                    className="w-full"
                  />
                </div>

                {/* TME */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tempo Médio de Espera (TME)</Label>
                    <span className="text-sm font-bold text-primary">{config.weight_tme}%</span>
                  </div>
                  <Slider
                    value={[config.weight_tme]}
                    onValueChange={([value]) => updateConfig('weight_tme', value)}
                    max={100}
                    min={0}
                    step={5}
                    className="w-full"
                  />
                </div>

                {/* Total */}
                <div className={`p-3 rounded-lg ${totalWeight === 100 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total</span>
                    <span className={`font-bold ${totalWeight === 100 ? 'text-green-500' : 'text-red-500'}`}>
                      {totalWeight}%
                    </span>
                  </div>
                  {totalWeight !== 100 && (
                    <p className="text-xs text-red-500 mt-1">
                      A soma dos pesos deve ser igual a 100%
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview do Cálculo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="w-5 h-5 text-primary" />
                  Preview do Cálculo
                </CardTitle>
                <CardDescription>
                  Veja como a pontuação será calculada com as configurações atuais
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 font-mono text-sm bg-muted/50 p-4 rounded-lg">
                  <div>
                    <p className="text-muted-foreground mb-2">Fórmula:</p>
                    <p className="text-foreground">
                      Score = (Conv × {config.weight_conversations}%) + (TMA × {config.weight_tma}%) + (TME × {config.weight_tme}%)
                    </p>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-muted-foreground mb-2">Exemplo:</p>
                    <p className="text-foreground">
                      Supondo: 80% da meta de conversas + TMA 🟢 (100pts) × 90% + TME 🟢 (100pts) × 85%
                    </p>
                    <p className="text-foreground mt-2">
                      = (80 × {config.weight_conversations / 100}) + (90 × {config.weight_tma / 100}) + (85 × {config.weight_tme / 100})
                    </p>
                    <p className="text-foreground mt-1">
                      = {(80 * config.weight_conversations / 100).toFixed(0)} + {(90 * config.weight_tma / 100).toFixed(0)} + {(85 * config.weight_tme / 100).toFixed(0)} = <span className="text-primary font-bold">{exampleScore} pontos</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}