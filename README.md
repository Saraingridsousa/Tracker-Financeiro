# Tracker Financeiro

Finanças pessoais em React/TypeScript, com consulta de contas e movimentações pelo **Meu Pluggy pessoal**, backend local e histórico opcional importado de arquivos.

> Integração dos quatro itens existentes verificada com leituras reais em 17/11/2026, além dos testes sintéticos. Identificação pelas contas: Mercado Pago confirmada; PicPay/Inter parcial; item apelidado Sofisa retornou investimentos sem contas e continua sem confirmação de instituição. Não é aplicativo multiusuário nem serviço para exposição na internet.

## Executar

Requer **Node.js 22.18 ou superior** (SQLite nativo) e npm. Para uso cotidiano, prefira a versão compilada abaixo. A manutenção de segurança e suas verificações estão registradas em `docs/STATUS.md`.

```sh
npm ci
npm test
npm run dev
```

Abra `http://127.0.0.1:5173`. O comando inicia Vite e backend local; `Ctrl+C` encerra os processos. A API usa `127.0.0.1:3001` por padrão. Se uma porta estiver ocupada, encerre o serviço correto em vez de expor o aplicativo à rede.

Para executar a versão compilada:

```sh
npm run build
npm start
```

Abra `http://127.0.0.1:3001`. `Ctrl+C` encerra o aplicativo. `npm run preview` verifica apenas o frontend e não substitui o backend.

No PowerShell, se `npm.ps1` for bloqueado pela política de scripts, use `npm.cmd` nos mesmos comandos, sem alterar essa política. O checkout desta feature é `Tracker-Financeiro-pluggy`, branch `feat/meu-pluggy-sync`; o checkout original não é alterado por esta feature.

## Conectar bancos sem enviar PDFs

1. Crie/acesse sua conta no [Meu Pluggy](https://meu.pluggy.ai) e autorize seus próprios bancos ali.
2. No Dashboard Pluggy, usando a mesma conta, escolha o conector **MeuPluggy**. Não escolha o banco diretamente nem Sandbox: o modo pessoal usa o proxy dos consentimentos existentes.
3. No Windows, use `%LOCALAPPDATA%/TrackerFinanceiro/config.env`, **fora do checkout e do OneDrive**. Um modelo vazio já foi preparado neste PC; numa instalação nova, crie-o usando `.env.example`. Preencha `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` somente nesse arquivo privado. Não envie chaves, senhas ou códigos pelo chat. Não use variáveis `VITE_*` para segredos.
4. Reinicie `npm run dev` ou `npm start` após configurar o arquivo. É possível indicar outro arquivo privado pela variável de ambiente `TRACKER_ENV_FILE`.
5. Os quatro itens informados pela titular já estão em `%LOCALAPPDATA%/TrackerFinanceiro/connections.json`, privado/editável. O backend registra esse mapeamento no SQLite ao iniciar, sem criar conexões na Pluggy. Para uma instalação nova, use `connections.example.json` como modelo; o arquivo deve conter somente uma lista de `{ "itemId": "UUID", "label": "Apelido" }`. Alternativamente, registre um item existente na aba **Conexões**. `TRACKER_CONNECTIONS_FILE` permite outro caminho privado.
6. Clique em **Sincronizar dados** para consultar contas, saldos, transações e produtos disponíveis. O apelido não confirma o banco: a instituição é identificada pelos dados das contas, nunca pelo conector MeuPluggy compartilhado.

Para localizar as credenciais: no [Dashboard](https://dashboard.pluggy.ai), abra **Aplicações**, fora da página Demo/JSON dos itens. Copie o **Client ID** da aplicação que contém os quatro itens; a engrenagem abre suas configurações. O **Client Secret** só é mostrado ao gerar. Se perdeu o anterior, gere outro nessa aplicação: o anterior é invalidado imediatamente e outras integrações que o utilizem também precisam ser atualizadas. Veja o [passo a passo oficial](https://docs.pluggy.ai/pt/docs/guides/dashboard-connectors#4-client-id-e-client-secret). Salve os dois valores somente nas linhas existentes `PLUGGY_CLIENT_ID=` e `PLUGGY_CLIENT_SECRET=` do config.env privado; preserve as demais linhas.

A modalidade pessoal documentada é gratuita, para os próprios dados, com até cinco conexões. A atualização bancária ocorre aproximadamente a cada 24 horas. O botão do Tracker **não força o banco a atualizar**. A rota de listagem `GET /v2/items` não está disponível nesse modo: os IDs são registrados explicitamente. Não há conexão automática sem consentimento.

Fontes oficiais: [guia pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), [guia de acesso à API](https://meu.pluggy.ai/api-guide). Fontes reconfirmadas em 17/11/2026. A autorização do proxy dura um ano e é distinta do consentimento de cada banco. Condições, cobertura e histórico disponível podem mudar; confira esses documentos ao configurar.

## Dados, segurança e backups

- Credenciais e chave de API ficam no backend, não no navegador. O banco SQLite padrão fica no diretório local da aplicação, fora do repositório. `TRACKER_DATA_DIR` pode apontar para outro diretório privado.
- A API é exclusiva de loopback e usa validação de Host/Origin e token CSRF nas alterações. Isso não substitui autenticação para uso remoto; não configure túnel, LAN ou hospedagem pública.
- Movimentações têm identidade do provedor. Repetir uma sincronização não deve duplicar registros; compras diferentes com o mesmo valor/data/descrição continuam separadas.
- Edições manuais de descrição/categoria, anotações e marca de transferência própria são preservadas nas consultas seguintes. Excluir uma movimentação conectada a oculta localmente: não altera o banco nem a Pluggy.
- Falhas, consentimento expirado ou uma resposta vazia não apagam o histórico já armazenado.
- **Backup bancário v3** exporta histórico conectado, produtos e edições manuais, sem credenciais. O SQLite usa migração aditiva v4. É um arquivo financeiro privado; guarde com cuidado. A restauração bancária pela interface não faz parte deste incremento.
- **Backup do histórico e preferências** mantém o fluxo JSON anterior para importações, categorias, regras e investimentos cadastrados. São dois conjuntos distintos, não um backup único.
- Dados antigos em `localStorage` não são apagados nem transferidos silenciosamente para o SQLite. Estão em **Histórico importado**, no mesmo navegador/origem em que foram salvos. Desenvolvimento e produção usam portas/origens diferentes; exporte o histórico antes de mudar de origem.

## Navegação do painel

- **Visão Geral** abre primeiro com indicadores, gráficos e transações. O card bancário mostra o saldo líquido atual das posições elegíveis, sem aplicar o filtro mensal às posições.
- **Investimentos** abre nos conectados da Pluggy, com filtros e histórico de resgatados. Instituições sem contas bancárias também aparecem. A **Carteira manual** continua separada e suas edições não alteram investimentos no banco.
- **Conexões** reúne configuração, sincronização, reconferência, consentimentos, backup bancário, saldos e faturas. Trocar de aba não sincroniza o provedor.

Aplicações e reservas reconhecidas como investimento ficam fora dos gastos; na tabela, aparecem como **Investimento · fora dos gastos**, com filtro próprio, mantendo o histórico e o sentido bancário original. Valores de moedas diferentes ficam separados. Cobertura parcial, leitura antiga e situações desconhecidas são sinalizadas; valores preservados em falhas são o último valor conhecido. Detalhes da política e aceite em [PG-004](docs/specs/pg-004-abas-investimentos-conectados.md) e [ADR 005](docs/decisions/005-investimentos-conectados.md).

## Como interpretar o painel

- **Bancos conectados** e **Histórico importado** são fontes separadas: não são somadas automaticamente para evitar duplicar gastos de extratos já importados.
- **Resultado do período** é entrada menos despesa liquidada em BRL; não é o saldo bancário. Saldos informados pelo provedor aparecem por conta. Saldo de cartão não é dinheiro disponível.
- Pendentes e moedas diferentes de BRL ficam fora do resultado padrão. Transações pendentes aparecem identificadas na tabela.
- Pix é um meio de pagamento, não prova de mesma titularidade. Transferência própria usa classificação explícita ou documentos completos e válidos iguais ao titular, comparados somente em memória. O checkbox permite corrigir a inferência; desmarcar prevalece sobre categoria de transferência. Fatura, investimento ou outra categoria excluída mantêm sua neutralidade independente.
- Regras ativas de categoria válida prevalecem sobre palavras-chave; o padrão mais específico tem prioridade. A categoria manual de uma transação conectada prevalece sobre a classificação automática.
- Faturas por cartão e posições de investimentos são consultadas quando a API retorna dados válidos. O painel distingue dados retornados, vazio, indisponível e erro, inclusive por cartão. Produtos anteriores são preservados em falhas/vazios, com data da consulta. Não são geradas despesas extras pelas faturas nem ordens na carteira manual; cotações, B3 e movimentos de investimentos não são importados.
- PDF/CSV/Excel/OFX continuam como alternativa histórica, não como etapa necessária da consulta bancária. Os importadores legados não foram inteiramente corrigidos nesta mudança.

A primeira leitura é integral. As seguintes usam sobreposição de 30 dias; a cada sete dias ou pelo botão **Reconferir histórico completo**, uma leitura integral procura correções mais antigas. Ausências não apagam registros. A interface separa última leitura bem-sucedida, tentativa e atualização na Pluggy.

## Arquitetura e acompanhamento

- `src/components/BankingPanel.tsx`: configuração orientada e consulta das conexões.
- `src/hooks/useBanking.ts` e `src/lib/bankingApi.ts`: cliente da API local; sem SDK/segredo Pluggy no frontend.
- `src/domain/finance.ts`: classificação e totais compartilhados, com cálculos em centavos.
- `server/`: HTTP local, persistência SQLite e adaptador de leitura da Pluggy.
- `tests/` e `src/domain/finance.test.ts`: contratos locais, UI renderizada e regressões sintéticas.
- `docs/specs/pluggy-personal.md`: escopo e critérios de aceite.
- `docs/decisions/`: decisões arquiteturais.
- `docs/STATUS.md`: estado canônico, verificações e pendências.

O Graphify é usado localmente para mapear relações do código. Saídas geradas, dependências, dados financeiros e segredos não são versionados.

## Identidade, restauração e períodos

O SQLite migra v1 → v2 de forma transacional. Um novo ID só substitui uma versão antiga por `providerId` textual não vazio, em correspondência 1:1 não ambígua na mesma conta/item. NSU/providerCode, descrição, data e valor não são chaves universais. IDs aposentados não voltam ao resultado por replay; colisões posteriores podem revogar a associação, com auditoria. Updates do mesmo ID sobrescrevem a observação anterior: isto não é um log imutável de cada consulta. Sem identidade suficiente, as operações ficam separadas e exigem conferência. Não há fusão automática entre itens/reconexões.

O backup bancário v2 conserva versões, reconciliações e overrides; valores convertidos pelo provedor retêm moeda/centavos originais com sinal e a origem do valor usado. Exportar esse JSON não comprova recuperação de desastre. O restaurador legado aceita `transactions`, `categories`, `rules`, `exportedAt`, sem exigir versão nova. `assets` e `investmentOrders` devem estar ambos presentes ou ambos ausentes; ausência preserva a carteira, arrays vazios válidos podem esvaziá-la. Arquivo bancário ou inválido é rejeitado antes de setters/escritas.

Mês bancário usa o relógio local do PC; histórico usa a maior data válida do extrato e mostra “Último mês importado”. Janelas incluem o mês de referência mais 1, 2, 5 ou 11 meses anteriores (2/3/6/12 meses), do primeiro dia inicial inclusivo ao primeiro dia do mês seguinte exclusivo. “Todos” não aplica esse corte. A virada do mês é percebida no próximo render; não há timer ou sincronização agendada. Datas civis são mantidas; em timestamps do provedor, `date` conserva o prefixo de calendário fornecido, com `providerDate` original retido, sem conversão automática para GMT-3.

## Verificação e limites conhecidos

Validação PG-003: 159 testes sem falhas/skips, TypeScript/Vite e 19 checks Chrome sintéticos; leituras reais repetidas dos quatro itens, sem alteração de contagens e com preservação do documento manual. Detalhes e limites em `docs/STATUS.md`. No marco anterior do início do zero, foram 139 testes, zero falhas/skips, e build aprovado. Chrome isolado: 10 verificações da troca para a base nova, sem ler nem restaurar dados financeiros antigos no boot e mantendo a cópia do navegador intacta. React compilado, HTTP e SQLite reais, com dados sintéticos somente no navegador de teste. Histórico de validações compartilhadas, carteira legada, Excel, comandos e Graphify em `docs/STATUS.md`. Isso não valida bancos reais.

Os cinco alertas anteriores foram corrigidos: Vite 6.4.6/esbuild 0.25.12, postcss-selector-parser 6.1.6, source-map-js 1.2.2 e SheetJS 0.20.3. O `npm audit --json` atual retornou exit 0 e zero vulnerabilidades reportadas; isso não é auditoria integral do aplicativo. O `xlsx` usa a [distribuição oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) com URL versionada e integridade fixada no lockfile. A instalação limpa foi verificada sem alterar o lockfile. Os controles Excel cobrem arquivos sintéticos `.xls`/`.xlsx` com datas e valores textuais brasileiros; não corrigem todos os formatos legados. O bundle principal acima de 500 kB, o aviso experimental do SQLite e a depreciação da linha Recharts 2 permanecem documentados.

## PC e celular com os mesmos dados

O modo privado opcional usa Tailscale Serve e mantém o backend em loopback. Histórico, categorias, regras e carteira manual passam a usar um documento SQLite compartilhado, com primeira cópia explícita e proteção contra alterações concorrentes. A cópia antiga do navegador fica preservada. Veja [ativação e recuperação](docs/private-access.md), [contrato PG-002](docs/specs/private-shared.md) e [ADR 003](docs/decisions/003-private-shared-state.md). Acesso real depende da instalação/login no PC e celular, além dos consentimentos bancários; resultados sintéticos não substituem essas etapas.

Depois de uma inicialização explícita, a base central também é usada no endereço local do PC. No início do zero, histórico/carteira/regras ficam vazios e somente categorias padrão são criadas; nenhum backup é importado automaticamente.
