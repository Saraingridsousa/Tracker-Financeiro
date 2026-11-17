# ADR 004 — itens privados e produtos separados

17/11/2026. Estender a integração existente; carregar connections.json privado e registrar itens apenas no SQLite local. Identificar instituições por contas, com confirmação/divergência/pendência; conector MeuPluggy não distingue bancos.

SQLite v4 acrescenta tabelas de produtos, metadados de sincronização e anotações/marca manual. Migração aditiva preserva transações, reconciliações, overrides e documento manual. Backup bancário v3 inclui novas famílias; formato legado/manual não muda e restauração bancária segue fora do escopo.

Faturas/investimentos opcionais têm resultados isolados; falha não limpa dados nem cria lançamentos. Lote válido de contas/transações e produtos é atômico no SQLite. Sobreposição de30dias e leitura integral semanal/explícita, sem inferir exclusões por ausência. Documentos para comprovar transferência própria são comparados em memória, não persistidos em claro. Anotações/marca manual acompanham identidades reconciliadas. Testes usam banco temporário explicitamente isolado e dados artificiais; relatórios reais ficam no diretório privado.

Revisão: marca manual falsa prevalece sobre a categoria de transferência, mantendo exclusões independentes; faturas mostram resultado por cartão. UUID de item é comparado sem caixa, IDs opacos preservados. COMPE exige três segmentos completos e documentos exigem verificadores válidos antes da inferência. Em falha de sync, o hook relê somente o cache HTTP local e mantém o erro original.
