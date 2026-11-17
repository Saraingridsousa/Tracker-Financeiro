# PG-002 — PC e celular com estado compartilhado

Autorização de Sara em 16/11/2026: conta Meu Pluggy, Inter e Mercado Pago primeiro; PicPay e Sofisa depois. Acesso de qualquer lugar, com PC ligado, privado e sem hospedagem paga. Histórico, categorias, regras e carteira devem ser os mesmos nos aparelhos.

## Contrato

- Backend continua em 127.0.0.1. Ingresso opcional pelo Tailscale Serve em HTTPS, com origem exata e identidade única autorizada; sem acesso anônimo local quando esse modo estiver ativo. Não usar Funnel.
- Configuração privada inválida/incompleta impede partida. Dev/Vite não pode operar com ingresso privado habilitado. Instalação, login e ativação de rede são etapas finais separadas; nenhum segredo no Git ou chat.
- Estado legado completo no SQLite, separado das tabelas bancárias: histórico, categorias, regras, ativos e ordens. Documento validado e escrito atomicamente com revisão esperada. Revisão desatualizada recebe conflito, sem sobrescrever.
- Migração explícita por cópia do navegador ou backup JSON conferido. Não apagar nem substituir armazenamento antigo do navegador. Carteira ausente em backup legado preserva a carteira atual; arrays vazios explícitos a substituem.
- Aparelhos leem o mesmo documento na abertura, ao voltar à janela e por atualização explícita. Sem promessa de atualização instantânea. Falha/conflicto preserva rascunho recuperável e bloqueia novas edições até resolução explícita.
- Sincronização de bancos não mistura totais com histórico importado. Dados reais só após participação privada de Sara nos consentimentos.

## Aceitação

| ID | Critério |
|---|---|
| PS-01 | Origem HTTPS exata + identidade proprietária em todas as rotas, CSRF mantido, modo local compatível |
| PS-02 | Documento compartilhado validado, persistente, CAS atômico; concorrência não perde dados |
| PS-03 | Inicialização explícita e cópia local preservada; backup incompleto não altera estado |
| PS-04 | Interface e hooks usam documento central para todos os dados solicitados; conflito recuperável |
| PS-05 | Suíte, build e runtime PC/celular sintéticos; original preservado; revisão independente |

Fontes: https://tailscale.com/docs/features/tailscale-serve e https://tailscale.com/docs/reference/tailscale-cli/serve (consultadas em 16/11/2026). Serve autentica a rede e remove cabeçalhos de identidade enviados pelo cliente. Cabeçalho isolado não autentica: somente proxy confiável em loopback integra esse limite de confiança. Processos locais já têm acesso ao SQLite. Uso exige máquinas pessoais sem usuários locais não confiáveis.

## Compatibilidade da carteira legada — 16/11/2026

A etapa de preservação encontrou backups antigos com assets.ticker (texto) e investmentOrders.officialTotal (valor finito, não negativo e dentro da precisão monetária aceita). São metadados opcionais conhecidos: conservar integralmente ao validar, exportar e persistir; não substituir tickerOrName/totalValue nem recalcular carteira a partir deles. Outros campos desconhecidos continuam recusados. Testar com fixtures sintéticas, sem incluir o backup financeiro real no Git. Não importar nem substituir dados automaticamente durante a preservação.

## Início do zero e origem central no PC — 16/11/2026

Sara substituiu a restauração de dados antigos pela criação explícita de uma base vazia, com categorias padrão. Nenhum backup antigo pode ser importado para esse início. Após inicialização explícita do documento, a API sinaliza sharedStateAvailable=true e o frontend usa a base central também em loopback. Antes disso, modo local legado permanece compatível. A troca não apaga nem copia o localStorage antigo. O sinal é booleano validado pelo cliente e não libera acesso privado; Host/Origin/identidade/CSRF seguem seu contrato.

No primeiro render HTTP, a interface aguarda confirmar a origem antes de hidratar dados financeiros do navegador. Base central inicializada não lê nem exibe as quatro chaves financeiras legadas na abertura. Hidratação/persistência local só ocorrem após confirmação de modo legado, e a conferência de uma cópia local em modo compartilhado exige clique explícito.
