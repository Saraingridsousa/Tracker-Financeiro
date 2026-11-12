# Estado — primeiro incremento Meu Pluggy

Atualizado em 12/11/2026. Este é o estado canônico; o handoff anterior e seus logs continuam como evidência histórica.

## Entregas e autoridade

- Entrega técnica local: **verified**, no escopo pessoal/loopback e com os riscos residuais abaixo. Código, suíte, build, navegador, comandos, preservação e Graphify foram exercitados. Não equivale a auditoria integral de segurança.
- Validação bancária real: **blocked**. Faltam prioridades bancárias, configuração privada, participação/consentimento e autorização explícita de Sara. Não houve consulta financeira real.
- Checkout: C:/Users/sarai/OneDrive/Documentos/Tracker-Financeiro-pluggy; branch feat/meu-pluggy-sync; base e066b54.
- Checkout original Tracker-Financeiro preservado: os seis arquivos com mudanças anteriores mantiveram seus hashes durante esta sessão. Não houve incorporação automática dessas alterações de investimentos.
- Nenhum push, PR, publicação, cobrança, alteração de Hermes, política do Windows, credencial global ou configuração bancária real.

## Implementação e commits locais

| Commit | Conteúdo |
|---|---|
| b64580c | Contrato de desenvolvimento, especificação e decisão local |
| 2052e19 | Política financeira compartilhada e regras efetivas |
| 9802e96 | HTTP/SQLite/Pluggy, CSRF e proteção local |
| be37198 | Identidade/versões, migração, categoria/fatura, validações monetárias e regressões |
| 30523c6 | Painel conectado à API, fontes separadas, restauração/períodos seguros, scripts e regressões de interface |

A documentação final fica em commit próprio posterior, conferido no git log e no manifesto ignorado de entrega. Cada commit foi limitado a allowlist e revisado com diff staged/check; dados, segredos e evidências não entram no Git.

## Verificação desta revisão

Ambiente: Windows, PowerShell 5.1; Node 22.18.0, npm 10.9.3 e Git 2.47.1.windows.1. npm.ps1 é bloqueado pela política existente; usamos node + npm-cli.js, sem mudar políticas. npm.cmd está disponível para uso interativo.

Todas as evidências atuais abaixo são relativas a .evidence/codex-2026-11-12/ (ignorada pelo Git):

| Execução | Resultado | Evidência |
|---|---|---|
| npm test — baseline real | exit 0; 105 testes, 0 falhas/skips | baseline-tests.log |
| npm run build — baseline | exit 0 | baseline-build.log |
| npm test — integração final | exit 0; 114 testes, 0 falhas/skips | delivery-tests.log |
| npm run build — final com canários privados descartáveis | exit 0; TSC app/node + Vite | delivery-build.log |
| Frontend compilado + Chrome headless novo + HTTP/SQLite em arquivo reais | exit 0; 24 verificações; 0 exceções JavaScript bloqueadoras | runtime-final.log, runtime-browser.json e PNGs runtime-* |
| npm start / npm run dev, configuração inválida, porta ocupada, encerramento | exit 0 do harness; 6 checks; falhas esperadas dos filhos com exit 1 | commands-final.log, commands-result.json e command-*.log |
| Hashes do fonte antes/depois dos checks finais | idênticos; HEAD de código 30523c6 | verified-source-hashes.json |
| Preservação do original | seis hashes iguais ao início da sessão | original-hashes.json, preservation-final.json |
| Fronteira de segredos | canários ausentes dos seis assets; formatos de tokens sem ocorrências nos arquivos da feature; logs finais, snapshot/backup/erro/DOM examinados | secret-boundary-final.json |

No navegador apenas o fetch do adaptador Pluggy foi substituído por fixture sintética, sem chamada externa financeira. Foram exercitados: estado sem configuração, registro do item exato, cursores, contas/saldos, categoria e descrição persistidas após sync/reabertura, pendências/moeda, card BRL e Top 5 consistentes, troca de fontes, input real de backup errado com storage/carteira intactos, erro/recuperação, teclado, temas e largura 390 px. As árvores próprias de Chrome/npm/servidor foram encerradas; suas portas ficaram fechadas. Os seis checks de comandos usam diretórios externos sintéticos; não usam config.env privado.

## Matriz de aceite local

As linhas de suíte abaixo usam npm test final, exit 0; nomes de arquivos localizam testes reproduzíveis. O resultado bancário real não é inferido desses testes.

| ID | Veredito | Arquivo/contrato → teste → evidência |
|---|---|---|
| PG-A01 | verified | server/app.mjs + static.mjs: loopback, Host/Origin exatos, CSRF, JSON e estáticos → tests/server-http.test.mjs → delivery-tests.log; canários em secret-boundary-final.json |
| PG-A02 | verified | server/pluggy.mjs: autenticação/401 limitado, timeout de corpo e cursor seguro completo → tests/server-pluggy.test.mjs → delivery-tests.log |
| PG-A03 | verified | server/store.mjs: idempotência, operações distintas, substituição 1:1, replay, colisão posterior, overrides, migração v1 real/integridade e rollback → server-identity/server-store/review-regressions.test.mjs → delivery-tests.log |
| PG-A04 | verified | Falhas/vazio/consentimento preservam histórico; momentos de consulta/provedor separados → server-http/server-pluggy/server-store.test.mjs e runtime-browser.json |
| PG-A05 | verified | Centavos, sinais BANK/CREDIT, FX com proveniência, datas e titularidade validadas → server-pluggy/server-finance/review-regressions.test.mjs → delivery-tests.log; moeda na UI em runtime-browser.json |
| PG-A06 | verified | BankingPanel → useBanking → bankingApi → HTTP/SQLite; sem PDF obrigatório; JSON inválido e respostas antigas recusados → banking-api/banking-order/frontend-review/ui-bank.test.mjs + 24 checks browser → delivery-tests.log, runtime-final.log |
| PG-A07 | verified | finance.ts governa Pix, regras, Saúde, fatura, pendências/FX e Top 5 → finance.test.ts, server-finance.test.mjs + browser → delivery-tests.log, runtime-browser.json |
| PG-A08 | verified | Suíte/build/execução, revisão independente, segredos, preservação, Graphify e commits conferidos → logs finais, manifests e git log; riscos residuais explicitados abaixo |
| PG-A09 | verified | backup.ts valida tudo antes dos setters; rejeita família bancária, preserva carteira ausente e aceita vazios válidos → backup-restore.test.mjs + input real browser → delivery-tests.log, runtime-browser.json |
| PG-A10 | verified | period.ts: relógio bancário, referência histórica e 2/3/6/12 meses → period/frontend-review.test.mjs → delivery-tests.log; futuro não desloca mês e virada invalida memo no próximo render |

F1–F5: todos verified pela suíte atual. F1 usa callback real e também input Chrome; F2 usa SQLite/versões/overrides/migração; F3 atravessa normalização → Store → resumo com controles negativos; F4 verifica regra/manual Saúde; F5 verifica relógio/pendência futura/histórico/virada de ano. Correções já presentes foram revisadas sem reintroduzir defeitos. As novas lacunas têm RED/GREEN em review-red.log, review-green*.log e ownership-red.log. O primeiro teste de ordenação falhou por erro de instrumentação; não o tratamos como RED do produto nem alegamos TDD desse caso. A regressão corrigida passa no runner oficial. Falhas intermediárias de harness/build e o diagnóstico visual de overflow permanecem nos logs.

Referência [Rafaelrr5/financas-br](https://github.com/Rafaelrr5/financas-br) reconferida: persistência SQLite, regras específicas antes de keywords, preservação manual e idempotência orientaram a comparação. Mantivemos React/TypeScript e a identidade bancária conservadora descrita na ADR-002; não copiamos o mecanismo de IDs de PDFs nem criamos agendamento.

Revisão independente adicional: somente leitura, probes sintéticos em memória; encontrou as lacunas novas e revisou as correções, sem novo defeito material identificado no escopo. Não executou o aceite final em nosso lugar. Relatório histórico original/probes também foram lidos; as asserções antigas confirmam defeitos, não aprovação.

## Graphify local

Graphify 0.9.104. Mapa anterior consultado como navegação e símbolos confirmados no fonte. Extração final code-only, em processo com ambiente sem credenciais de provedor; cluster-only --no-label; nenhum backend semântico/cloud, instalação global ou --force. JSON, GRAPH_REPORT.md e graph.html não vazios em .evidence/codex-2026-11-12/implementation-map/graphify-out/.

Resultado: 399 nós, 867 relações, 17 comunidades; extração, relatório/HTML e diagnose multigraph com exit 0. Não há endpoints ausentes/pendentes ou colapso de arestas. Três autorreferências foram conferidas: collect em scripts/test.mjs e walk nos testes backup-restore/period; são recursões reais. Backup, período e testes de identidade estão no mapa. Cinco arquivos não produziram símbolos no AST (postcss.config.js, src/main.tsx, banking-api.test.mjs, commands.test.mjs e vite.config.ts); isso limita o mapa. Dependências, dist, .evidence e dados/segredos ficaram excluídos. O grafo é navegação, não prova financeira/segurança.

## Limites e riscos residuais

- npm audit real retornou exit 1: 5 pacotes alertados (3 high, 2 moderate), 0 critical. Vite 5.4.21, esbuild 0.21.5, postcss-selector-parser 6.1.4 e source-map-js 1.2.1 pertencem ao desenvolvimento/build; xlsx 0.18.5 é o importador opcional. dependency-audit.json registra os advisories. Vite é um risco do modo dev mesmo em loopback; npm start usa o servidor próprio. O advisory esbuild descreve seu modo serve, que este projeto não invoca diretamente. Não importar planilhas não confiáveis. Não houve audit fix, troca em massa de dependências ou mudança do lockfile. Próxima manutenção: avaliar migração direcionada do toolchain e origem/distribuição do SheetJS, com regressões; responsável agente/Sara para priorização, sem impedir o fluxo compilado sem arquivos.
- Fontes de segurança conferidas: [Vite](https://github.com/vitejs/vite/security/advisories/GHSA-4w7w-66w2-5vf9), [esbuild](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99), [distribuição oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Há mais advisories individuais no audit; cinco pacotes não significa apenas cinco avisos individuais.
- Build mantém bundle principal ~666 kB e worker PDF ~1,26 MB; são custo de carregamento/memória, sem erro de build. Node 22 avisa que SQLite é experimental. Não houve supressão de warnings.
- Identidade: somente providerId não ambíguo na mesma conta/item; nada de fusão por NSU/valor/data/texto ou entre reconexões. Ambiguidades exigem conferência. Mesmo ID é upsert; não se promete log imutável de toda observação. Migração v1 não recupera identificadores descartados retroativamente.
- Exportação bancária v2 não implementa restauração nem comprova recuperação de desastre. Legado/carteira e SQLite são fontes/backups distintos; portas/origens têm localStorage diferente, sem migração silenciosa.
- Datas usam o calendário fornecido pelo provedor, com providerDate preservado; nenhum ajuste global de fuso. Referência de mês usa relógio local, invalida memo no próximo render e não tem timer/cron. Somente o botão consulta o provedor; abrir carrega o cache local.
- Sem autenticação multiusuário, rede remota, pagamentos, carteira Pluggy/B3 ou conciliação automática de saldo. Resultado BRL liquidado não é saldo da conta e cartão não é dinheiro disponível.
- Scanner cobriu canários descartáveis e formatos conhecidos nos arquivos da feature/assets e saídas especificadas. Não examinou credenciais privadas nem representa auditoria exaustiva. Nenhum segredo real foi usado em testes.

## Execução e próxima ação

Na pasta/branch corretas, use npm.cmd run build e npm.cmd start no PowerShell; abra http://127.0.0.1:3001. npm.cmd test executa o runner oficial; npm.cmd run dev abre frontend em 127.0.0.1:5173 + API 3001. Ctrl+C encerra. Dependências já estavam instaladas; numa instalação nova, npm.cmd ci preserva o lockfile. README documenta configuração privada em %LOCALAPPDATA%/TrackerFinanceiro/config.env e SQLite no mesmo diretório externo; não criar segredos/dados no OneDrive.

Banco real permanece blocked; responsável Sara. Precisamos saber: bancos/cartões prioritários; se já há Meu Pluggy/conexões consentidas; uso só PC ou necessidade remota; autorização explícita para leitura/conferência após configuração privada. Não enviar chaves, senha, 2FA ou extratos no chat. Cobertura, histórico disponível, sinais e saldos reais só serão verificados com comparação representativa autorizada.

Condições pessoais reconfirmadas em 12/11/2026 nas [fontes oficiais](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) e no [guia Meu Pluggy](https://meu.pluggy.ai/api-guide): uso próprio gratuito, até cinco conexões, atualização diária e autorização do proxy de um ano separada dos consentimentos bancários. Não são garantia comercial nem aprovação da conta concreta de Sara. Sem consulta financeira real nesta entrega.
