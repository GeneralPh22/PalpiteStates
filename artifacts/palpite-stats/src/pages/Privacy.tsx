import { Shield } from "lucide-react";

export default function Privacy() {
  return (
    <div className="pb-24 pt-8">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-display font-bold text-white">Política de Privacidade</h1>
            <p className="text-zinc-500 text-sm">Última atualização: março de 2026 · Conformidade com LGPD</p>
          </div>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-zinc-400 leading-relaxed">
          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">1. Quem Somos</h2>
            <p>
              PalpiteStats ("nós", "nosso", "serviço") é uma plataforma de análise esportiva acessível em{" "}
              <span className="text-primary">www.palpitestats.com</span>. Somos responsáveis pelo tratamento
              dos seus dados pessoais conforme descrito nesta política.
            </p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">2. Dados Coletados</h2>
            <p className="mb-3">Coletamos apenas os dados estritamente necessários para o funcionamento do serviço:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong className="text-zinc-300">Endereço de email</strong> — para criação e acesso à conta</li>
              <li><strong className="text-zinc-300">Senha</strong> — armazenada apenas como hash criptográfico (bcrypt)</li>
              <li><strong className="text-zinc-300">Dados de assinatura</strong> — plano, período de validade, status</li>
              <li><strong className="text-zinc-300">Dados de pagamento</strong> — processados exclusivamente pela Stripe (não armazenamos números de cartão)</li>
              <li><strong className="text-zinc-300">Logs de acesso</strong> — IP e timestamps para segurança, retidos por 30 dias</li>
            </ul>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">3. Finalidade do Tratamento</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>Autenticação e gerenciamento da sua conta</li>
              <li>Processamento de pagamentos e controle de assinatura</li>
              <li>Comunicações essenciais sobre a sua conta (verificação de email, alertas de expiração)</li>
              <li>Segurança e prevenção de fraudes</li>
            </ul>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">4. Base Legal (LGPD)</h2>
            <p className="mb-3">O tratamento dos seus dados é realizado com base em:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong className="text-zinc-300">Consentimento</strong> (art. 7, I) — coletado no momento do cadastro</li>
              <li><strong className="text-zinc-300">Execução de contrato</strong> (art. 7, V) — para processar sua assinatura e fornecer o serviço</li>
              <li><strong className="text-zinc-300">Legítimo interesse</strong> (art. 7, IX) — para segurança e prevenção de abusos</li>
            </ul>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">5. Compartilhamento de Dados</h2>
            <p className="mb-3">Compartilhamos seus dados apenas com:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong className="text-zinc-300">Stripe</strong> — processador de pagamentos (sujeito à política de privacidade da Stripe)</li>
              <li><strong className="text-zinc-300">API-Football</strong> — para dados esportivos (não recebe seus dados pessoais)</li>
            </ul>
            <p className="mt-3">Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">6. Seus Direitos (LGPD)</h2>
            <p className="mb-3">Você tem os seguintes direitos em relação aos seus dados:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>Confirmar a existência do tratamento</li>
              <li>Acessar seus dados</li>
              <li>Corrigir dados incompletos ou incorretos</li>
              <li>Solicitar a anonimização, bloqueio ou eliminação</li>
              <li>Portabilidade dos dados</li>
              <li>Revogar o consentimento</li>
            </ul>
            <p className="mt-3">Para exercer esses direitos, entre em contato: <span className="text-primary">privacidade@palpitestats.com</span></p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">7. Retenção de Dados</h2>
            <p>
              Seus dados são mantidos enquanto sua conta estiver ativa. Após o encerramento da conta, os dados são
              removidos em até 30 dias, exceto quando a retenção for exigida por lei.
            </p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">8. Segurança</h2>
            <p>
              Utilizamos criptografia bcrypt para senhas, HTTPS para transmissão de dados, e tokens de sessão seguros.
              Nosso banco de dados é hospedado em ambiente seguro com acesso restrito.
            </p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">9. Cookies</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para autenticação (cookie de sessão <code className="text-primary">ps_session</code>).
              Não utilizamos cookies de rastreamento ou publicidade.
            </p>
          </section>

          <section className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-3">10. Contato</h2>
            <p>
              Dúvidas sobre esta política ou sobre seus dados:{" "}
              <span className="text-primary">privacidade@palpitestats.com</span>
            </p>
            <p className="mt-2">
              Esta política pode ser atualizada periodicamente. Notificaremos usuários ativos por email em caso de mudanças significativas.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
