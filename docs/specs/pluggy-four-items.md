# PG-003 — quatro itens existentes e produtos de leitura

Autorização de Sara em 17/11/2026: usar os quatro itemIds fornecidos, em connections.json privado/editável fora do Git. Credenciais somente em config.env do backend. Sem criar itens, pagamentos, refresh bancário, push, publicação ou deploy.

Reutilizar PluggyClient/HTTP/SQLite/hooks. Instituição vem das contas (COMPE em transferNumber com três segmentos ou nome reconhecido); nunca connector.id/name. Apelido atribuído não equivale a identificação confirmada. Mostrar divergência/pendência.

Primeira consulta integral, seguintes com sobreposição de30dias; integral semanal ou explícita reconfere correções antigas. Usar cursor completo em /v2/transactions. Não usar /v2/items nem createdAtFrom como substituto de leitura de correções. Ausências/vazios não apagam histórico; não é um feed de exclusões.

Faturas GET /bills por conta CREDIT e investimentos GET /investments por item, todas as páginas. Resposta define disponível/vazio/indisponível/erro; products não prova existência de dados. Falhas opcionais preservam produtos anteriores e são sinalizadas, sem apagar contas/transações válidas. Produtos não geram despesas artificiais nem são somados à carteira manual.

Preservar categorias, descrições, anotações e marca manual de transferência em tabelas separadas e na reconciliação. Pix não comprova titularidade: inferência só com documentos completos de pagador/recebedor iguais ao titular, comparados em memória sem persistir documentos em claro. Manter última tentativa, leitura bem-sucedida, atualização do provedor e resultado de cada produto distintos.

Testes somente em SQLite temporário isolado: paginação, filtros/cursor, duplicidades, falhas, migração, edições e metadados. Credenciais locais habilitam leitura real dos4itens e conferência no Tracker; UPDATED/SUCCESS não prova importação. Dados/manuais e base nova preservados.

Fontes oficiais: https://docs.pluggy.ai/pt/docs/guides/meu-pluggy-personal-use ; https://docs.pluggy.ai/openapi/pluggy-api.json ; https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor ; https://docs.pluggy.ai/en/reference/bill/bills-list ; https://docs.pluggy.ai/en/reference/investment/investments-list ; https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.pdf . Proxy diário, sem refresh manual e sem enumeração de itens.

Revisão de aceite: uma desmarcação manual explícita prevalece sobre inferência e categoria de transferência; neutralidade independente (fatura/investimento/outra categoria excluída) permanece. Mostrar resultado de faturas por cartão, inclusive sucesso parcial. UUIDs de item são comparados sem distinguir caixa; IDs opacos de contas/produtos não são alterados. COMPE exige exatamente três segmentos preenchidos; prova documental automática exige também dígitos verificadores válidos de CPF/CNPJ.

Depois de uma consulta com falha, a interface relê somente o cache local para mostrar o erro/última tentativa atuais, preservando a mensagem original e os dados caso essa releitura também falhe.
