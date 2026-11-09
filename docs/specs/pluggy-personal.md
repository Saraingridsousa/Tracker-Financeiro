# PG-001 — Meu Pluggy pessoal, primeiro incremento

## Objetivo e autoridade

Sara autorizou iniciar o desenvolvimento e realizar commits ao longo do trabalho. Substituir a exigência cotidiana de PDFs por leitura dos próprios bancos e incorporar persistência, regras, conferência e testes inspirados no financas-br.

## Escopo deste incremento

- Interface React mantida; backend local Node >=22.18 com SQLite, sem dependências nativas externas.
- Servidor somente 127.0.0.1. A escolha é um limite técnico reversível desta etapa; a usuária ainda não definiu acesso remoto.
- API key e Client Secret somente no backend. Dados fora do checkout/OneDrive por padrão.
- Registrar IDs de itens MeuPluggy previamente autorizados, consultar contas e todas as páginas de transações por cursor e persistir idempotentemente.
- Tela de configuração/conexões, saldos por conta, sincronização explícita e estado de erro/atualidade.
- Histórico importado separado dos dados conectados para não duplicar totais silenciosamente; não apagar dados existentes.
- Regras personalizadas e política de consumo compartilhadas; testes sintéticos e smoke HTTP real local.

## Fora de escopo

Conectar bancos sem participação de Sara, pedir credenciais no chat, iniciar pagamentos, contratar planos, fazer push, publicar na rede, validar com dados reais ainda não autorizados, reconciliar automaticamente IDs que mudem após reconexão, ou incorporar trabalho local preexistente de investimentos.

## Critérios

| ID | Aceitação |
|---|---|
| PG-A01 | HTTP só loopback, Host/Origin validados e mutações protegidas contra CSRF; sem segredo no JSON público |
| PG-A02 | Cliente autentica no servidor, trata timeout/401 sem expor segredos e segue `next` em `/v2/transactions` com proteção contra loop/URL externa |
| PG-A03 | Repetir sync não duplica; IDs distintos preservam operações iguais; alterações preservam categoria/descrição manuais |
| PG-A04 | Falha ou leitura vazia não remove histórico; metadados de consulta e atualização do banco separados |
| PG-A05 | Valores em centavos no SQLite; conversão distingue conta bancária e cartão; moeda explícita, sem conversão cambial inventada |
| PG-A06 | Interface oferece fluxo Meu Pluggy, registro e sincronização de item; não exige PDF e não afirma conexão bancária testada |
| PG-A07 | Pix de terceiros conta como receita/despesa; transferência própria somente por marca explícita; regra personalizada precede keyword |
| PG-A08 | Testes e build passam; fluxo HTTP exercido e alterações originais preservadas; commits locais conferidos |

## Base e preservação

Base: e066b54d7207651bd0f83dc2b4dbe9b23f950b0f. Branch `feat/meu-pluggy-sync`, worktree separado. O checkout principal tem alterações de investimentos não commitadas, preservadas sem inclusão automática.

## Fontes oficiais consultadas

- https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use.md
- https://meu.pluggy.ai/api-guide
- https://docs.pluggy.ai/en/docs/authentication.md
- https://docs.pluggy.ai/en/docs/products/transactions
- https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor
- https://nodejs.org/download/release/v22.18.0/docs/api/sqlite.html

Termos verificados na descoberta: uso pessoal gratuito até cinco conexões, atualização original a cada 24h, itens proxy não atualizáveis manualmente, listagem de itens indisponível e consentimento com validade própria. Revalidar condições antes de conectar contas reais. Disponibilidade e histórico dos bancos de Sara ainda são desconhecidos.
