
Objetivo: corrigir a tela de configuração dos robôs no mobile para que os controles de IA fiquem realmente clicáveis e o layout não “empurre” os switches para fora da área útil.

Diagnóstico confirmado:
- O problema está na página `src/pages/admin/AdminRobos.tsx`, dentro da configuração (`isConfigOpen`).
- Os cards das ferramentas usam `justify-between`, mas o lado esquerdo ainda ocupa largura demais em telas estreitas.
- Alguns blocos internos ainda não têm contenção completa de largura, então o texto cresce, comprime o switch e parte dele fica fora da área clicável.
- O rodapé com “Voltar / Salvar e publicar” também está no fim do layout e precisa continuar acessível no mobile sem sobrepor os controles.
- O replay mostra interação na área dos switches, então não parece ser ausência total do componente, e sim problema de layout/área tocável.

Implementação proposta:
1. Reforçar a responsividade dos cards de ferramentas em `AdminRobos.tsx`
   - Padronizar os blocos para mobile com:
     - container principal usando `gap-3`, `min-w-0`
     - coluna de texto usando `flex-1 min-w-0`
     - títulos e descrições com `break-words`/quebra adequada
     - switch com `shrink-0` para nunca ser comprimido
   - Aplicar isso em todos os cards da aba “Ferramentas”, não só em alguns já ajustados.

2. Melhorar o comportamento em telas muito estreitas
   - Nos cards mais longos, trocar o layout mobile para empilhar conteúdo e ação:
     - `flex-col` no mobile
     - `sm:flex-row sm:justify-between` a partir de telas maiores
   - Deixar o switch alinhado à direita em `sm+` e no próprio fluxo no mobile, garantindo área de toque limpa.

3. Ajustar conteúdos dependentes abaixo dos switches
   - Revisar blocos condicionais como:
     - `groupMessagesTime`
     - modos de transferência
     - listas de departamentos/agentes
   - Remover recuos fixos excessivos como `ml-13` no mobile e usar algo responsivo (`ml-0 sm:ml-13`) para evitar estouro horizontal.

4. Garantir footer utilizável no mobile
   - Manter o footer visível e confortável com:
     - layout empilhado no mobile se necessário
     - botões com largura adequada
     - espaço inferior compatível com a navegação móvel fixa
   - Se necessário, transformar o footer em barra sticky no mobile para o botão salvar permanecer acessível.

5. Validação após implementação
   - Testar a configuração dos robôs em largura mobile (~390px), especialmente a aba “Ferramentas”.
   - Confirmar que:
     - todos os switches aparecem inteiros
     - todos os switches podem ser tocados
     - não existe overflow horizontal
     - o botão salvar continua visível
     - a experiência desktop permanece intacta

Arquivos principais:
- `src/pages/admin/AdminRobos.tsx`
- possivelmente sem alterar lógica em `src/components/ui/switch.tsx`, a menos que o ajuste visual mostre necessidade de ampliar target/touch area

Detalhe técnico:
- A correção deve priorizar layout responsivo no container da página, não a lógica do switch em si.
- O `Switch` base já está funcional; o gargalo aparente é a composição visual dos cards e seus wrappers em mobile.
