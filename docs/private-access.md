# PC e celular — ativação privada

Implementação PG-002. O backend permanece em 127.0.0.1. A rede privada é opcional, via Tailscale Serve; não usar Funnel. Não foi ativada por este documento.

## Antes da primeira cópia

Se a escolha foi começar do zero, use um documento novo explicitamente vazio com categorias padrão; não importe os backups antigos. Após inicialização, o PC também utiliza a base central no acesso local. As instruções de exportação abaixo se aplicam a quem deseja levar seu histórico existente.

No endereço HTTP antigo do PC, exporte o backup completo em Configurações. Confira histórico, categorias, regras, ativos e ordens. Guarde esse JSON fora do Git/OneDrive compartilhado. O navegador não compartilha localStorage entre HTTP e a nova URL HTTPS: na primeira visita privada, importar esse backup costuma ser a opção correta.

A tela de primeira cópia mostra as cinco contagens antes de confirmar. “Conferir” não grava. Cópia vazia é permitida apenas por confirmação explícita. O armazenamento antigo permanece preservado, mas alterações novas passam a ser gravadas no SQLite do PC. Carteira bancária/produtos Pluggy continuam separados da carteira manual.

## Configuração final

1. Instalar Tailscale no PC e celular a partir de https://tailscale.com/download e autenticar os dois com a conta pessoal da proprietária. Login, eventuais termos e confirmação do Windows são feitos por Sara. Não usar dispositivos compartilhados ou com tag de servidor.
2. Conferir na conta Tailscale o DNS completo do PC e o login proprietário. Usar o plano pessoal gratuito se disponível; não contratar recursos pagos. O PC precisa continuar ligado, conectado e sem suspensão para receber acessos.
3. No arquivo privado %LOCALAPPDATA%/TrackerFinanceiro/config.env, acrescentar ambos os campos, preenchidos localmente:

   TRACKER_PRIVATE_ORIGIN=https://nome-do-pc.nome-da-rede.ts.net
   TRACKER_PRIVATE_USER=login-da-proprietaria

   O primeiro é somente a origem HTTPS, sem barra final, porta ou caminho. O segundo é o valor exato de Tailscale-User-Login, normalmente o e-mail de entrada. Não enviar credenciais/chaves ao chat nem usar VITE_. O modelo .env.example contém os nomes, sem valores reais.
4. Parar a execução anterior. Na pasta Tracker-Financeiro-pluggy executar npm.cmd run build e npm.cmd start. Em modo privado, acesso HTTP direto ao localhost deve retornar 403, inclusive para sessão e backup. Não executar dev ou preview para acesso remoto.
5. Conferir se já existe alguma configuração Serve neste PC antes de alterá-la: tailscale serve status. Não substituir serviços existentes sem revisão. Para um PC sem serviços existentes, o comando preparado é tailscale serve --bg http://127.0.0.1:3001. Habilitação de HTTPS, se solicitada, depende de Sara na conta Tailscale. No Windows a versão instalada pode exigir a CLI no contexto administrativo; não alterar políticas do Windows como atalho.
6. Abrir a URL HTTPS resultante no PC e celular, com Tailscale conectado. Conferir a cópia inicial e confirmar uma única vez. Só o login configurado pode acessar o Tracker, mesmo que haja outros participantes na rede privada.

A origem e o login são configuração privada, não incluídos nas respostas públicas. O Serve remove identidade recebida do cliente e injeta a identidade autenticada. O aplicativo confia apenas nesse proxy local; um processo no próprio PC já tem acesso ao banco. Usar PC pessoal, sem usuários locais não confiáveis.

## Uso e recuperação

Os cinco conjuntos de dados legados são um documento único com revisão. Abertura, retorno à janela e “Atualizar dados” fazem nova leitura; não há transmissão instantânea. Edições de um evento são uma gravação atômica. Uma revisão antiga recebe conflito, preserva rascunho neste navegador e bloqueia edições. Exportar o rascunho antes de descartá-lo e recarregar; revisar o estado atual antes de reaplicar mudanças. Falha de confirmação pode ocorrer depois de o PC já ter salvo.

Não restaurar rascunho às cegas: ele é uma cópia inteira e pode conter versões antigas de outras alterações. Reaplicar somente as mudanças desejadas sobre um backup atual. Se localStorage estiver indisponível/cheio, a gravação é abortada antes do envio, com rascunho em memória para exportação; não fechar a janela antes de exportar.

Backups: usar exportação completa do histórico/carteira e exportação bancária separada. Não copiar SQLite aberto manualmente. SQLite interno v3 mantém o formato de backup bancário v2; o documento compartilhado usa o envelope legado. A restauração bancária permanece fora deste incremento.

## Desativar com segurança

Primeiro desligar apenas o serviço Serve criado para este Tracker, conferindo o status e o comando de desativação da versão instalada. Não usar reset global se houver outros serviços. Depois parar o Tracker, remover os dois campos privados e reiniciar. Desligar Serve antes de voltar ao modo local; o modo local também rejeita cabeçalhos de proxy/Tailscale como defesa adicional. O SQLite e a cópia antiga permanecem preservados. Para voltar a uma versão anterior que só entende SQLite v2, guardar uma cópia íntegra fechada do v2 antes da primeira abertura no v3; não editar PRAGMA manualmente.

## Bancos reais

Prioridade confirmada: Inter e Mercado Pago; depois PicPay e Sofisa. Sara já tem Meu Pluggy, mas ainda não criou conexões. Autorizar os bancos dentro de meu.pluggy.ai e, no Dashboard, usar o conector Meu Pluggy da aplicação demo. Preencher Client ID/Secret somente no arquivo privado e guardar os IDs dos itens. Não listar /v2/items. A aplicação consulta o que o proxy já disponibilizou; não força atualização bancária. Cobertura, alcance histórico, consentimentos e valores precisam ser conferidos por banco com Sara.

Fontes oficiais consultadas em 16/11/2026: https://tailscale.com/docs/features/tailscale-serve, https://tailscale.com/docs/reference/tailscale-cli/serve e https://meu.pluggy.ai/api-guide. Recursos gratuitos e termos devem ser reconfirmados na ativação; este roteiro não contrata serviço.
