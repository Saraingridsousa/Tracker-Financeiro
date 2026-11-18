# Estado — Tracker Financeiro / Meu Pluggy

## PG-004 — abas e investimentos conectados — 17/11/2026

Implementação retomada do Antigravity a partir de `42ecb88`, preservando o teste de domínio não commitado. Esse marco continha a especificação/ADR, mas ainda não o seletor nem a reorganização da interface. Trabalho feito somente em `Tracker-Financeiro-pluggy`, branch `feat/meu-pluggy-sync`.

- Visão Geral inicial: navegação junto ao cabeçalho; indicadores/gráficos/transações, fonte bancária ou histórica e resumo compacto das conexões. O bloco administrativo aparece somente em Conexões.
- Investimentos: conectados por padrão, filtros de instituição/classe/situação, distribuições BRL, posições atuais e histórico, referência/origem/última leitura e campos opcionais sem inventar valores. Carteira manual preservada em visão separada, sem soma ou conversão automática.
- Conexões: instruções, registro, consentimentos/status, sincronização, reconferência, backup, saldos e faturas mantidos. Cadastro e diagnóstico ficam expansíveis; posições têm acesso à aba Investimentos.
- Estado compartilhado normal compacto; conflito, rascunho e primeira cópia mantêm os controles completos. Nada foi alterado no backend, na base financeira ou nos consentimentos.
- Seletor único `connectedInvestments.ts`: `ACTIVE` atual em centavos por moeda; resgatados, pendentes, desconhecidos e não retornados fora da soma. Falhas preservam último valor conhecido e sinalizam cobertura parcial. Situação desconhecida também torna a cobertura parcial. Período das transações não recorta posições.

Verificação técnica: **175 testes, zero falhas/skips**, `npm test` exit 0; `npm run build` exit 0 (TypeScript app/node + Vite). Aviso de bundle >500 kB, SQLite experimental e avisos de encerramento do scanner Vite de harnesses antigos permanecem; não se afirma execução sem avisos. Novos testes cobrem teclado (setas/Home/End/foco), troca de abas sem chamadas ao controlador, card/resumo coerentes, independência do período e preservação de carteira/recuperação. RED do domínio herdado e RED da cobertura desconhecida observados antes do respectivo código; SSR novo também falhou antes da criação do componente.

Cache real consultado exclusivamente por GET local e renderizado com React SSR: seletor/card/resumo coerentes, instituição sem contas representada, posições inativas excluídas e documento compartilhado idêntico antes/depois. **Isso não valida interação/layout no navegador nem equivale a nova sincronização real.** Relatório agregado ignorado em `.evidence/pg-004-2026-11-17/read-live-cache.json`; nenhum snapshot com valores reais foi gravado para essa conferência.

**Aceite visual pendente:** conector do navegador indisponível (`The browser access host is unavailable`). No turno anterior, o controle Windows interrompeu a navegação por não conseguir confirmar a URL. Desktop/390 px, temas, console e operações de Conexões no navegador ainda precisam de verificação desta versão. A sincronização real repetida desta etapa não foi executada; idempotência segue coberta por fixtures/SQLite temporário e pelo marco PG-003.

Graphify atualizado por AST local, code-only, sem chaves/LLM/rotulagem externa: **548 nós, 1319 relações brutas, 24 comunidades**. O grafo simples de clustering representa 1264 pares, agrupando 55 variantes de relações (por exemplo `calls`/`contains`); o diagnóstico aponta zero endpoints ausentes/pendentes e zero duplicatas exatas. As relações brutas ficam no JSON. Mapa em `.evidence/pg-004-2026-11-17/implementation-map/graphify-out/`; mapa auxilia navegação e não prova correção financeira.

Commits locais da implementação: `4b24ecb` (seletor/testes/contrato) e `ef96960` (abas/interface/regressões). Documentação em commit próprio. Sem push, merge, publicação ou reset/restauração de dados. Evidências e build continuam ignorados pelo Git.


## Ativação bancária real — 17/11/2026

**Integração local ativada e leitura real verificada** após a titular preencher uma nova credencial pelo formulário nativo privado. Esta seção prevalece sobre os bloqueios históricos de configuração/consentimento abaixo. Configuração e mapeamento permanecem em `%LOCALAPPDATA%/TrackerFinanceiro`, fora do Git e do OneDrive. Nenhum segredo foi incorporado ao código.

As quatro conexões fornecidas foram consultadas pelo backend e lidas novamente por `/api/banking`, com persistência SQLite e interface compilada reais. PicPay, Mercado Pago e Inter retornaram contas/movimentações; o item apelidado Sofisa retornou investimentos, sem contas/movimentações nessa leitura. A confirmação automática da instituição por contas permanece parcial para PicPay/Inter e indisponível para Sofisa; não se confundiu o apelido com identificação confirmada.

Verificações da ativação: suíte do snapshot executado com 158 testes passando/zero falhas, TypeScript app/node e Vite build com exit 0; sincronização repetida sem aumento das contagens ou IDs duplicados; documento compartilhado manual intacto; SQLite integrity_check OK; segredo ausente do snapshot público, seis arquivos do build e logs de runtime inspecionados. Houve avisos Vite/esbuild durante encerramento de harnesses e de bundle grande; não se afirma saída sem avisos nem auditoria integral das finanças. Produtos conectados continuam separados da carteira manual.

Evidência privada e contagens reais em `%LOCALAPPDATA%/TrackerFinanceiro/verification/`: `tracker-live-sync.json`, `persisted-live-summary.json`, `rendered-live-check.json`, `activation-verification.json`, `tests-current.log`, `build-current.log` e backup anterior à leitura. Endereço compilado verificado: `http://127.0.0.1:3001`; processo de desenvolvimento também mantém a porta 5173. Somente processos identificados deste Tracker foram reiniciados. Sem pagamentos, publicação, push ou novos consentimentos.

Há outro editor ativo no checkout: `src/hooks/useBanking.ts` mudou depois do snapshot testado/compilado. A ativação não editou código de produção, não desfez alterações preexistentes e não substitui o aceite das mudanças concorrentes. Esta verificação comprova conexão/importação e interface observadas, não conciliação integral com extratos nem classificação perfeita de cada lançamento. Acesso remoto pelo celular continua separado desta ativação local.

## Marco anterior — início do zero

O início do zero abaixo permanece como histórico de preservação. O documento manual foi preservado durante a ativação; os dados bancários foram adicionados às tabelas separadas da integração.


## Início do zero — marco anterior

Sara confirmou explicitamente que não quer usar dados antigos. Criado documento novo no SQLite por API local com CSRF/revisão esperada: **revisão 1, zero transações, regras personalizadas, ativos e ordens; 12 categorias padrão do código**. Nenhum backup antigo foi lido/restaurado para criar esse documento. Cópias antigas continuam arquivadas fora do Git. Não é necessário continuar procurando ou escolhendo o backup anterior para esse início.

A interface passa a usar a base central também em loopback somente após inicialização explícita. API sinaliza sharedStateAvailable booleano; antes disso, mantém o modo legado. Hooks aguardam confirmar a origem antes de hidratar dados financeiros locais. O boot da base central não consulta as quatro chaves financeiras antigas, nem exibe seus dados transitoriamente. Conferir cópia local antiga exige clique explícito. Host/Origin/identidade/CSRF permanecem inalterados.

Aceite atual em .evidence/fresh-start-2026-11-16/: RED2 para sinal/validação e RED em Chrome para leitura legada inicial; **139 testes, zero falhas/skips**, build exit0 e **10 checks no Chrome compilado**, incluindo zero leituras legadas no boot, nenhuma cópia de dados antigos, carteira vazia, armazenamento anterior intacto e viewport390 sem overflow. Revisão independente confirmou hidratação/persistência sem corrida. Graphify local/code-only/no-label: **469 nós, 1049 relações, 18 comunidades**, sem endpoints ausentes ou colapso.

Aplicação real reiniciada somente pela árvore de processos própria previamente identificada. Verificados frontend atualizado, API central ativa e documento vazio preservado após reinício. Endereço local: http://localhost:5173. Uma aba anterior pode precisar de F5. Há **zero conexões bancárias** e credenciais Pluggy ainda não configuradas; acesso privado pelo celular continua pendente. A próxima etapa é autorizar/configurar Inter e Mercado Pago pelo fluxo pessoal, sem importar backups antigos.

## Etapa 1 — preservação e compatibilidade em 16/11

Cópias locais existentes preservadas com SHA-256 idêntico, fora do Git/OneDrive; originais mantidos. Relatórios com contagens e referências ficam exclusivamente na pasta privada de backups. Nenhum backup financeiro real entra em fixtures, commits ou mapa de código.

A usuária informou histórico vazio e dificuldade de localizar a exportação. Depois substituiu essa busca pela decisão de começar do zero. Não houve restauração desses backups; o documento novo é independente das cópias antigas.

Corrigida incompatibilidade estrita de metadados conhecidos da carteira: assets.ticker opcional textual e investmentOrders.officialTotal opcional monetário não negativo. São preservados no roundtrip, sem substituir campos principais ou mudar cálculos. Tipos inválidos e outros campos desconhecidos continuam rejeitados. Revisão independente sem bloqueadores.

Verificações novas em .evidence/legacy-preservation-2026-11-16/: RED de dois testes antes da correção; suíte **137 testes/zero falhas e skips**, build exit 0 e **35 checks Chrome** com dados sintéticos, incluindo restauração compilada e reabertura SQLite preservando os metadados. Graphify local code-only/no-label: **466 nós, 1040 relações e 18 comunidades**, sem endpoints ausentes ou colapso. Evidências anteriores abaixo permanecem históricas para seu respectivo código.

## PG-002 — PC e celular, aceite técnico em 16/11

**Implementação verified; ativação real pendente.** Sara confirmou Meu Pluggy sem conexões, Inter/Mercado Pago primeiro, depois PicPay/Sofisa. Quer acesso de qualquer lugar, aceita PC ligado e escolheu rede privada sem hospedagem paga. Histórico, categorias, regras e carteira devem ser iguais nos dois aparelhos. Essas decisões estão resolvidas, não devem ser perguntadas novamente.

- Ingresso opcional Tailscale Serve: backend segue 127.0.0.1, exige origem HTTPS exata e login proprietário em todas as rotas, sem fallback anônimo. Modo local rejeita cabeçalhos de proxy/Tailscale. Dev recusa configuração privada antes de iniciar filhos. Nenhum Serve/Funnel/porta LAN foi ativado.
- Documento completo no SQLite v3 com validação comum frontend/backend, primeira cópia explícita e revisão CAS atômica. Migração v1/v2 preserva bancos; backup bancário segue formato v2 separado. Nenhum dado real do navegador foi copiado automaticamente.
- Hooks existentes usam o estado central no modo privado. Cópia antiga local fica preservada, inclusive na leitura inicial falha. Reabertura/foco/botão fazem nova leitura; não há push instantâneo. Rascunho pendente é exportável e nunca reaplicado automaticamente. Erro de confirmação pode ocorrer após o PC já ter gravado.
- Renomeação/palavras-chave mantêm texto intermediário local e salvam ao sair/Enter. Leitura de localStorage bloqueado não impede abrir estado central; falha de escrita aborta envio e permite exportar rascunho em memória. Recuperação tem foco e camada acima de modais sem perder texto ainda não enviado.

| Verificação em 16/11 | Resultado | Evidência ignorada em .evidence/private-shared-2026-11-16/ |
|---|---|---|
| Linha de base | 117 testes, exit 0 | baseline-tests.log |
| TDD servidor/cliente/UI/modal | RED demonstrado antes das respectivas correções | red-server.log, red-client.log, red-ui.log, red-modal.log |
| Suíte final | **135 testes, zero falhas/skips**, exit 0 | tests-final.log |
| Build final | TSC app/node + Vite, exit 0 | build-final.log |
| Compartilhamento em Chrome | **34 checks**, zero exceções; dois contextos independentes e terceiro com storage bloqueado | runtime-shared.json, runtime-shared.log, shared-*.png |
| Regressão local em Chrome | **25 checks**, zero exceções | local-runtime/runtime-browser.json, runtime-local.log |
| Comandos reais | **6 checks**, start/dev/porta ocupada/config inválida/encerramento | commands/commands-result.json, commands-final.log |
| Graphify | **464 nós/1024 relações/18 comunidades**, diagnose sem endpoints ausentes/colapso | graph-summary.json, implementation-map/graphify-out/ |
| Preservação/limpeza | 6 hashes originais iguais; 0 Chrome QA remanescentes; portas próprias encerradas | preservation.json, cleanup-verified.json, runtime-*-cleanup.json |
| Fronteira da validação | Adaptador bancário e ingresso confiável sintéticos; React compilado, HTTP e SQLite reais | runtime-shared.json, local-runtime/runtime-browser.json |

Revisão independente encontrou e fechou: proxy sem configuração privada; gravação local antes de modo confirmado; texto intermediário inválido de categoria; leitura de storage negada; recuperação coberta por modal. Regressões unitárias e Chrome cobrem os casos. A revisão também fortaleceu o teste de headers para usar a porta real e um controle permitido. O mapa orienta navegação; não é prova de segurança/finanças.

**Ativação em andamento:** Sara autorizou executar o instalador. Tailscale 1.104.7 instalado e serviço autenticado (Running), verificados na etapa de ativação; assinatura e SHA-256 do fornecedor conferidos antes da execução. O preflight encontrou Serve sem serviços e porta 3001 livre, mas nenhum ingresso privado foi ativado. Tracker iniciado somente em loopback para conferir/exportar o histórico e a carteira antigos. Computer Use interrompeu a navegação por não conseguir confirmar a URL atual com segurança. Próximo passo: conferir o backup, configurar origem/login privados, ativar Serve e testar no celular conforme [roteiro](private-access.md). Banco real continua aguardando conexões/consentimentos e configuração privada. Sem cobrança ou leitura financeira real.

## Entregas e autoridade

- Entrega técnica local: **verified**. Implementação, correções, dependências, suíte/build, runtime, preservação, Graphify e commits conferidos no escopo pessoal/loopback.
- Cinco alertas anteriores de dependências: **verified — corrigidos**; audit atual com exit 0 e zero vulnerabilidades reportadas. Não é auditoria integral de segurança.
- Validação bancária real: **blocked**. Meu Pluggy e bancos prioritários já confirmados; faltam conexões/consentimentos e configuração privada. A autorização para prosseguir já foi recebida. Ainda não houve consulta financeira real nem comparação com bancos.
- Checkout C:/Users/sarai/OneDrive/Documentos/Tracker-Financeiro-pluggy; branch feat/meu-pluggy-sync; base e066b54. A preservação anterior dos seis arquivos foi verificada no seu marco histórico. Na etapa de backups, o checkout original já foi observado limpo na main; não foi alterado ou restaurado pelo fix atual.
- Sara autorizou commit e push do código em 16/11. Entrega na branch feat/meu-pluggy-sync do origin; sem merge na main ou publicação do aplicativo. Tailscale instalado/autenticado; Serve privado ainda não ativado. Nenhuma cobrança, pagamento ou alteração de políticas do Windows.

## Commits locais

| Commit | Conteúdo |
|---|---|
| b64580c | Contrato, especificação e decisão local |
| 2052e19 | Política financeira compartilhada e regras efetivas |
| 9802e96 | HTTP/SQLite/Pluggy, CSRF e proteção local |
| be37198 | Identidade/versões, migração, classificação e validações financeiras |
| 30523c6 | Painel/API, fontes separadas, restauração/períodos e comandos |
| 82f82eb | Aceite local inicial e documentação |
| f1af2f6 | Correções direcionadas das dependências e regressão Excel |

Documentação desta manutenção fica em commit próprio posterior, conferido no git log e no manifesto ignorado de entrega. Cada commit usa allowlist e revisão do diff staged/check; dados, segredos e evidências permanecem fora do Git. Os commits 9d7076e/4d3aabc/b02184c/73aa440 registram contrato, backend, interface e aceite do estado compartilhado; a atualização da ativação fica em commit documental próprio.

## Manutenção de dependências

| Pacote | Antes | Depois | Motivo |
|---|---|---|---|
| vite | 5.4.21 | 6.4.6 | Correções do servidor de desenvolvimento; sem migrar além do necessário |
| esbuild | 0.21.5 | 0.25.12 | Cadeia compatível do Vite atualizado |
| postcss-selector-parser | 6.1.4 | 6.1.6 | Patch dentro do range do Tailwind/PostCSS |
| source-map-js | 1.2.1 | 1.2.2 | Patch dentro do range do PostCSS |
| xlsx / SheetJS | 0.18.5 | 0.20.3 | Tarball da distribuição oficial com URL versionada e SHA-512 no lockfile |

Node 22.18.0 e plugin-react 4.7.0 foram mantidos; os peers/engines são compatíveis. O diff do lock limita-se a esses pacotes e suas cadeias/binários opcionais. Não houve audit fix --force, atualização geral ou mudança incidental de React/Tailwind/Recharts. Instalações executadas sem scripts de lifecycle e sem audit automático.

SheetJS: SHA-512 do tarball local inspecionado coincide com o lock; pacote sem scripts de instalação. A versão do registro npm é desatualizada; a origem escolhida é o [CDN oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Vite usa a [migração oficial v5→v6](https://v6.vite.dev/guide/migration). A instalação limpa pelo lockfile preservou seu hash.

A primeira tentativa de npm audit desta manutenção foi bloqueada pela revisão automática por possível divulgação de nomes privados. Foram examinados o lock e o cliente npm: zero dependências privadas/workspaces, somente registry.npmjs.org e cdn.sheetjs.com, raiz omitida do bulk. A reavaliação foi aprovada; audit explícito com configuração npm vazia e registro público retornou exit 0/zero vulnerabilidades. Nenhum código, segredo ou dado financeiro foi enviado. Prova em audit-disclosure-proof.json; não houve desvio da rejeição ou auditoria oculta durante install/ci.

## Verificações históricas de 12/11 e evidências

Ambiente: Windows/PowerShell 5.1; Node 22.18.0, npm 10.9.3, Git 2.47.1.windows.1. npm.ps1 permanece bloqueado pela política existente; npm-cli.js foi usado e npm.cmd está disponível. Nenhuma política foi alterada.

Evidências atuais em **.evidence/dependency-hardening-2026-11-12/**, ignorada pelo Git. A entrega anterior está preservada em .evidence/codex-2026-11-12/ (114 testes/24 checks browser); seus logs são históricos, não o aceite atual.

| Execução | Resultado | Artefato |
|---|---|---|
| npm test antes das atualizações | exit 0; 114 testes, zero falhas/skips | baseline-tests.log |
| Compatibilidade Excel antes da troca | exit 0; 3 testes no parser real | excel-before-upgrade.log |
| npm ci --ignore-scripts --no-audit --no-fund | exit 0; hash do lock inalterado | clean-install.log |
| npm test após instalação limpa | exit 0; **117 testes**, zero falhas/skips | final-tests.log |
| npm run build após instalação limpa | exit 0; TSC app/node + Vite 6.4.6 | final-build.log |
| npm audit --json | exit 0; **0 vulnerabilidades reportadas** | audit-upgraded.json, audit-upgraded-result.json |
| Chrome novo + build real + HTTP/SQLite em arquivo reais | exit 0; **25 checks**, zero exceções JS bloqueadoras | runtime-final.log, runtime-browser.json, runtime-*.png |
| npm start/dev, porta ocupada/configuração inválida e encerramento | exit 0 do harness; **6 checks**; filhos falham com exit 1 nos casos esperados | commands-final.log, commands-result.json, command-*.log |
| Segredos/preservação | 6 assets sem canários; arquivos modificados sem formatos de tokens; 6 hashes originais preservados | secret-boundary.json, preservation.json |

O browser usa somente fetch Pluggy sintético; não existe consulta financeira externa. Além do fluxo anterior completo, foi exercitada a importação Excel pelo input real e pelo chunk dinâmico do frontend compilado. Categoria/descrição, sync/reabertura, pendências/moedas, totais BRL/Top 5, troca de fontes, rejeição de backup bancário sem perder histórico/carteira, erro/recuperação, teclado, temas e largura 390 px foram mantidos. Chrome e árvores próprias npm/servidor foram encerrados e suas portas confirmadas fechadas.

## Matriz de aceite local

Todos os testes abaixo estão no runner npm test atual (exit 0, final-tests.log). Resultados sintéticos não aprovam bancos reais.

| ID | Veredito | Contrato → teste → evidência |
|---|---|---|
| PG-A01 | verified | app/static: loopback, Host/Origin exatos, CSRF, JSON/limites/estáticos → server-http.test.mjs → suíte atual e secret-boundary.json |
| PG-A02 | verified | pluggy: autenticação/401 limitado, timeout de corpo e cursores seguros completos → server-pluggy.test.mjs → suíte atual |
| PG-A03 | verified | Store: idempotência, versões 1:1, replay/colisão, overrides, migração SQLite v1/integridade/rollback → server-identity/server-store/review-regressions.test.mjs → suíte atual |
| PG-A04 | verified | Vazio/falha/consentimento preservam histórico; consulta e provedor separados → testes server-http/pluggy/store + runtime-browser.json |
| PG-A05 | verified | Centavos, sinais BANK/CREDIT, FX com proveniência, datas e titularidade → server-pluggy/server-finance/review-regressions.test.mjs + UI de moedas → suíte/browser atuais |
| PG-A06 | verified | React → hook/cliente → HTTP/SQLite sem PDF obrigatório, respostas inválidas/superadas recusadas → banking-api/banking-order/frontend-review/ui-bank.test.mjs + 25 checks browser |
| PG-A07 | verified | Pix/regras/manual Saúde/fatura, exclusões e rankings compartilhados → finance.test.ts/server-finance.test.mjs + cards/Top 5 no browser |
| PG-A08 | verified | Install limpo, suíte/build/audit/runtime, revisão, segredos/preservação/Graphify e commits → logs/manifests atuais e git log |
| PG-A09 | verified | Validar backup antes de setters; família bancária rejeitada, carteira ausente preservada/vazios válidos → backup-restore.test.mjs + input Chrome real |
| PG-A10 | verified | Relógio bancário, referência histórica e 2/3/6/12 meses → period/frontend-review.test.mjs → suíte atual |

F1–F5 continuam verified, incluindo caminhos reais de normalização → SQLite → snapshot → resumo. Compatibilidade de dependências foi testada antes e depois da troca, sem alegação de TDD para atualização de pacotes. Evidência RED/GREEN das correções anteriores permanece na entrega histórica; o RED inicial de concorrência tinha erro de harness, não era RED do produto.

Revisão independente somente leitura da manutenção: sem achados bloqueadores ou ampliação incidental; peers/engines e SHA-512 conferidos. Os testes Excel cobrem datas/valores textuais brasileiros em .xls/.xlsx; não comprovam todos os formatos nativos/seriais do importador legado. Os checks finais foram executados pelo integrador. A [referência financas-br](https://github.com/Rafaelrr5/financas-br) permanece como inspiração de persistência/regras; não houve reescrita/copiar mecanismo de identidade de PDFs.

## Graphify histórico — 12/11

Graphify 0.9.104: extração local code-only com ambiente sem credenciais; cluster-only --no-label e diagnose multigraph com exit 0. Sem cloud, backend semântico, instalação global ou --force. JSON, GRAPH_REPORT.md e graph.html atuais em .evidence/dependency-hardening-2026-11-12/implementation-map/graphify-out/.

Resultado: 401 nós, 873 relações, 17 comunidades. Diagnóstico sem endpoints ausentes/pendentes ou colapso. As três autorreferências são collect em scripts/test.mjs e walk em backup-restore/period; recursão confirmada no fonte. Seis arquivos sem símbolos no AST: postcss.config.js, src/main.tsx, banking-api.test.mjs, commands.test.mjs, excel-import.test.mjs e vite.config.ts. Dependências/dist/evidências/dados/segredos excluídos. O mapa é navegação, não prova financeira/segurança.

## Limites atuais

- Audit zero cobre advisories conhecidos do npm naquele momento; não comprova ausência de todos os defeitos. Não foi usado segredo real nos testes. Scanner de canários/formatos conhecidos tem escopo declarado e não lê configurações privadas.
- Bundle principal ~691 kB no build de 16/11, worker PDF ~1,26 MB e aviso experimental do SQLite permanecem. O npm ci também informa depreciação da linha Recharts 2; não há advisory reportado no audit atual. Não foi suprimido warning nem ampliada a manutenção para migração visual.
- Importadores legados não foram inteiramente corrigidos. Não há restauração bancária/recuperação de desastre demonstrada só pela exportação JSON.
- Identidade conservadora: providerId não ambíguo na mesma conta/item; nenhuma fusão por NSU/valor/data/texto ou entre reconexões. Mesmo ID é upsert, não log imutável de cada consulta. V1 não recupera identificadores perdidos retroativamente.
- No modo local, histórico/carteira continuam no navegador. No privado, seus cinco conjuntos ficam no documento SQLite central, separado da família bancária. Origens possuem localStorage distinto, sem migração silenciosa. Resultado BRL liquidado não é saldo bancário; cartão não é dinheiro disponível.
- Datas conservam o calendário do provedor com providerDate; sem ajuste global de fuso. Virada de mês invalida no próximo render, sem timer/cron. Abrir lê cache local; consulta do provedor continua pelo botão.
- Sem hosting pago, autenticação multiusuário, pagamentos, carteira Pluggy/B3 ou conciliação automática de saldo. Acesso privado PC/celular implementado, ainda sem ativação real.

## Preferência de uso recebida em 16/11/2026

Decisão confirmada: acesso de qualquer lugar, PC ligado, rede privada sem hospedagem paga e estado completo igual. Implementação e critérios em PG-002/ADR 003; ativação real pendente de instalação/login. Nenhuma porta LAN, publicação ou cobrança habilitada.

O fluxo bancário foi reconfirmado nas fontes oficiais em 16/11: a titular conecta seus bancos em meu.pluggy.ai e depois usa o conector MeuPluggy no Dashboard da mesma conta. Não se deve escolher o conector direto do banco no Dashboard para este caminho pessoal. Login, aprovação bancária e consentimentos são feitos privadamente pela titular.

## Configuração privada e próxima ação

Foi criado **somente se ausente** um modelo vazio em C:/Users/sarai/AppData/Local/TrackerFinanceiro/config.env, fora do OneDrive. Nenhum segredo existente foi lido ou sobrescrito; nenhuma credencial real foi configurada. Registro private-config-preparation.json. Sara deve preencher privadamente Client ID/Client Secret e realizar os consentimentos no fluxo oficial; nunca enviá-los ao chat.

Para executar: na pasta/branch corretas, npm.cmd run build e npm.cmd start; abrir http://127.0.0.1:3001. npm.cmd test executa a suíte; npm.cmd run dev usa frontend 127.0.0.1:5173 + API 3001. Ctrl+C encerra. A instalação usa npm.cmd ci com lockfile; os checks desta manutenção usaram --ignore-scripts/--no-audit e audit explícito separado.

Naquele marco de 16/11, a etapa bancária real estava **pendente de dados/participação necessários**, não por nova solicitação de autorização: faltam criação das conexões/consentimentos no Meu Pluggy e preenchimento privado da configuração. Portal, bancos e acesso remoto já foram confirmados. Silêncio não configura consentimento bancário nem credenciais. Nenhuma chamada ao banco será inventada. Após esses pré-requisitos, comparar amostras de sinais, moedas, datas, compras/faturas/pendências, duplicações, histórico e saldos, com retenção mínima e evidência anonimizada.

Condições pessoais e fluxo continuam conforme as [fontes oficiais](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) e [guia Meu Pluggy](https://meu.pluggy.ai/api-guide) reconfirmados em 16/11/2026; cobertura/histórico da conta concreta ainda não verificados.
