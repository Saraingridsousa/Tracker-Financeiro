# Estado — Tracker Financeiro / Meu Pluggy

Atualizado em 12/11/2026. Estado canônico após a manutenção de segurança autorizada por Sara.

## Entregas e autoridade

- Entrega técnica local: **verified**. Implementação, correções, dependências, suíte/build, runtime, preservação, Graphify e commits conferidos no escopo pessoal/loopback.
- Cinco alertas anteriores de dependências: **verified — corrigidos**; audit atual com exit 0 e zero vulnerabilidades reportadas. Não é auditoria integral de segurança.
- Validação bancária real: **blocked** por participação/configuração privada/consentimentos e definição dos bancos prioritários. A autorização para prosseguir já foi recebida. Ainda não houve consulta financeira real nem comparação com bancos.
- Checkout C:/Users/sarai/OneDrive/Documentos/Tracker-Financeiro-pluggy; branch feat/meu-pluggy-sync; base e066b54. Checkout original Tracker-Financeiro preservado: seis hashes iguais aos da sessão e ao manifesto histórico.
- Não houve push, PR, publicação, cobrança, pagamentos, exposição de rede, mudança de Hermes/políticas do Windows ou leitura de credenciais reais.

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

Documentação desta manutenção fica em commit próprio posterior, conferido no git log e no manifesto ignorado de entrega. Cada commit usa allowlist e revisão do diff staged/check; dados, segredos e evidências permanecem fora do Git.

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

## Verificações atuais e evidências

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

## Graphify

Graphify 0.9.104: extração local code-only com ambiente sem credenciais; cluster-only --no-label e diagnose multigraph com exit 0. Sem cloud, backend semântico, instalação global ou --force. JSON, GRAPH_REPORT.md e graph.html atuais em .evidence/dependency-hardening-2026-11-12/implementation-map/graphify-out/.

Resultado: 401 nós, 873 relações, 17 comunidades. Diagnóstico sem endpoints ausentes/pendentes ou colapso. As três autorreferências são collect em scripts/test.mjs e walk em backup-restore/period; recursão confirmada no fonte. Seis arquivos sem símbolos no AST: postcss.config.js, src/main.tsx, banking-api.test.mjs, commands.test.mjs, excel-import.test.mjs e vite.config.ts. Dependências/dist/evidências/dados/segredos excluídos. O mapa é navegação, não prova financeira/segurança.

## Limites atuais

- Audit zero cobre advisories conhecidos do npm naquele momento; não comprova ausência de todos os defeitos. Não foi usado segredo real nos testes. Scanner de canários/formatos conhecidos tem escopo declarado e não lê configurações privadas.
- Bundle principal ~680 kB, worker PDF ~1,26 MB e aviso experimental do SQLite permanecem. O npm ci também informa depreciação da linha Recharts 2; não há advisory reportado no audit atual. Não foi suprimido warning nem ampliada a manutenção para migração visual.
- Importadores legados não foram inteiramente corrigidos. Não há restauração bancária/recuperação de desastre demonstrada só pela exportação JSON.
- Identidade conservadora: providerId não ambíguo na mesma conta/item; nenhuma fusão por NSU/valor/data/texto ou entre reconexões. Mesmo ID é upsert, não log imutável de cada consulta. V1 não recupera identificadores perdidos retroativamente.
- Histórico/carteira e SQLite são fontes/backups separados. Portas/origens possuem localStorage distinto, sem migração silenciosa. Resultado BRL liquidado não é saldo bancário; cartão não é dinheiro disponível.
- Datas conservam o calendário do provedor com providerDate; sem ajuste global de fuso. Virada de mês invalida no próximo render, sem timer/cron. Abrir lê cache local; consulta do provedor continua pelo botão.
- Sem hosting, autenticação multiusuário, acesso remoto/celular, pagamentos, carteira Pluggy/B3 ou conciliação automática de saldo.

## Configuração privada e próxima ação

Foi criado **somente se ausente** um modelo vazio em C:/Users/sarai/AppData/Local/TrackerFinanceiro/config.env, fora do OneDrive. Nenhum segredo existente foi lido ou sobrescrito; nenhuma credencial real foi configurada. Registro private-config-preparation.json. Sara deve preencher privadamente Client ID/Client Secret e realizar os consentimentos no fluxo oficial; nunca enviá-los ao chat.

Para executar: na pasta/branch corretas, npm.cmd run build e npm.cmd start; abrir http://127.0.0.1:3001. npm.cmd test executa a suíte; npm.cmd run dev usa frontend 127.0.0.1:5173 + API 3001. Ctrl+C encerra. A instalação usa npm.cmd ci com lockfile; os checks desta manutenção usaram --ignore-scripts/--no-audit e audit explícito separado.

A etapa bancária real continua **blocked por dados/participação necessários**, não por nova solicitação de autorização: faltam bancos/cartões prioritários, situação dos consentimentos Meu Pluggy, preenchimento privado do modelo e definição PC versus necessidade remota. Pergunta objetiva já apresentada a Sara; silêncio não configura consentimento bancário nem credenciais. Nenhuma chamada ao banco será inventada. Após esses pré-requisitos, comparar amostras de sinais, moedas, datas, compras/faturas/pendências, duplicações, histórico e saldos, com retenção mínima e evidência anonimizada.

Condições pessoais e fluxo continuam conforme as [fontes oficiais](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) e [guia Meu Pluggy](https://meu.pluggy.ai/api-guide) reconfirmados em 12/11/2026; cobertura/histórico da conta concreta ainda não verificados.
