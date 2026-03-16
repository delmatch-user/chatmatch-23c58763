const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
      <p className="text-muted-foreground mb-4">Última atualização: 03 de março de 2026</p>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">1. Informações que Coletamos</h2>
        <p>Coletamos informações que você nos fornece diretamente ao interagir com nossos serviços, incluindo nome, número de telefone e mensagens enviadas através do WhatsApp e Instagram Direct.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">2. Uso das Informações</h2>
        <p>Utilizamos as informações coletadas para:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Fornecer atendimento ao cliente via WhatsApp e Instagram</li>
          <li>Melhorar nossos serviços e experiência do usuário</li>
          <li>Cumprir obrigações legais</li>
        </ul>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">3. Compartilhamento de Dados</h2>
        <p>Não vendemos ou compartilhamos suas informações pessoais com terceiros, exceto quando necessário para a prestação dos nossos serviços ou quando exigido por lei.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">4. Integração com Meta (Facebook/Instagram)</h2>
        <p>Utilizamos as APIs do Meta para receber e enviar mensagens via Instagram Direct. As mensagens são processadas de acordo com as políticas do Meta e armazenadas de forma segura em nossos servidores.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">5. Segurança</h2>
        <p>Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações pessoais contra acesso não autorizado, alteração ou destruição.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">6. Seus Direitos</h2>
        <p>Você tem o direito de acessar, corrigir ou excluir suas informações pessoais. Para exercer esses direitos, entre em contato conosco.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">7. Exclusão de Dados</h2>
        <p>Você pode solicitar a exclusão dos seus dados a qualquer momento. Após a solicitação, seus dados serão removidos em até 30 dias.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">8. Contato</h2>
        <p>Para dúvidas sobre esta política, entre em contato pelo e-mail disponível em nosso site ou pelos nossos canais de atendimento.</p>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
