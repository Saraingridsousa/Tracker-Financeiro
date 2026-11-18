# PG-004 — Abas Visão Geral / Investimentos / Conexões e investimentos conectados

Pedido de Sara em 17/11/2026, branch `feat/meu-pluggy-sync`. Reorganizar a interface e usar na aba Investimentos os investimentos reais já importados pela integração MeuPluggy. Sem novas conexões, consentimentos, pagamentos, sincronização agendada, push ou deploy. Base: commit 31db8f7.

## Requisitos

- R1. Navegação principal logo abaixo do cabeçalho com três abas: **Visão Geral** (inicial), **Investimentos**, **Conexões**. Padrão WAI-ARIA tabs: `tablist`/`tab`/`tabpanel`, `aria-selected`, setas/Home/End.
- R2. Visão Geral mostra indicadores, gráficos e transações sem o bloco bancário extenso. Apenas um resumo compacto das conexões (quantidade, última leitura, erros) com acesso a Conexões. Mensagens deixam de citar “painel acima”.
- R3. Conexões concentra instruções, registro de itemId, status/consentimento/última leitura/erros, sincronização por conexão, reconferência completa, backup bancário, saldos por conta, faturas e diagnóstico dos investimentos (com acesso à aba Investimentos). Detalhes técnicos em áreas expansíveis.
- R4. Aviso “Dados compartilhados no PC” compacto quando normal; erro, rascunho pendente e primeira cópia continuam com o painel completo.
- R5. Investimentos tem duas visões explícitas: **Conectados** (padrão) e **Carteira manual** (componente existente intacto). Sem soma automática entre elas e sem converter posições conectadas em ativos manuais.
- R6. Conectados usa somente `banking.snapshot.products.investments` e `connections[].productStates.investments`, por um seletor de domínio puro (`src/domain/connectedInvestments.ts`). Resumo do valor atual elegível, distribuição por instituição e classe, lista com identificação/instituição/classe/situação/valor atual/data de referência, filtros por instituição/classe/situação, histórico de resgatados acessível por filtro, origem e última leitura visíveis.
- R7. Estados: carregando, erro de leitura local, sem conexões, não consultado, vazio, erro/indisponível por conexão (cobertura parcial) e leitura antiga (> 48 h). Ausência de dado não vira zero.
- R8. Card da Visão Geral no modo “Bancos conectados” passa a “Valor atual dos investimentos”, calculado pelo mesmo seletor da aba Investimentos, com origem e cobertura parcial explícitas. No modo “Histórico importado” mantém o indicador da carteira manual, rotulado como tal. O filtro de período das transações não afeta o patrimônio atual.
- R9. Estado bancário mantido no `useBanking` do App: trocar de aba não recria conexões nem dispara leitura externa.

## Critérios de aceite

| ID | Critério | Verificação |
|---|---|---|
| A1 | App abre em Visão Geral sem `banking-title` antes do dashboard | teste SSR/harness + Chrome |
| A2 | Três abas acessíveis por teclado, desktop e ~390 px | teste de teclas + Chrome |
| A3 | Conexões mantém cadastro, status, sync, reconferência, backup e erros | teste SSR + Chrome |
| A4 | Trocar de aba não chama sync/addConnection/refresh | harness com contadores |
| A5 | Somente `ACTIVE` atual entra no total; resgatados, pendentes, desconhecidos e não retornados ficam fora | testes de domínio |
| A6 | Item sem contas (ex.: Sofisa) aparece nos investimentos | teste de domínio + dados reais |
| A7 | Moedas não somadas entre si; campos ausentes “não informado” | testes de domínio/SSR |
| A8 | Mesma posição não duplica (id do provedor por item) | teste de domínio + resync real |
| A9 | Card e resumo conectado usam o mesmo cálculo | harness do App |
| A10 | Falha/indisponível/não consultado sinaliza cobertura parcial | testes de domínio/SSR |
| A11 | Carregando não mostra R$ 0,00 definitivo | harness/SSR |
| A12 | Carteira manual intacta; nenhum segredo no build/logs/docs | suíte existente + varredura |

## Fora de escopo

Cotações, B3, movimentos/ordens de investimentos, rentabilidade calculada, preço médio, conversão cambial, deduplicação entre carteira manual e conectada, alterações de backend sem necessidade comprovada.
