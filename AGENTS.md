# Tracker Financeiro — contrato de desenvolvimento

- Desenvolvimento por especificações: consultar `docs/specs/pluggy-personal.md`, `docs/decisions/` e `docs/STATUS.md` antes de alterar comportamento.
- Neste incremento, uso pessoal e servidor exclusivamente loopback. Acesso remoto não está autorizado.
- Nenhum segredo, extrato real, banco SQLite ou estado de navegador entra no Git. Credenciais Pluggy são exclusivas do backend; nunca `VITE_*`.
- Fluxo gratuito: contas autorizadas no Meu Pluggy e conector MeuPluggy no Dashboard. Sem criar conexão direta ao banco, contratar plano, iniciar pagamentos ou prometer tempo real.
- Atualizar o aplicativo lê os dados já disponíveis na Pluggy; não força a atualização bancária do proxy.
- Não usar `GET /v2/items`. Os IDs de conexão conhecidos são registrados explicitamente. Transações usam paginação cursor em `/v2/transactions`.
- Preservar histórico em consultas vazias/erros/consentimento expirado. Correções do usuário são campos separados dos dados do provedor.
- Pix não prova transferência própria. Duas compras iguais continuam duas se seus IDs forem diferentes. Não somar moedas distintas ou saldos de cartão como dinheiro disponível.
- Testes antes do código de produção. Executar `npm test` e `npm run build` antes de concluir uma etapa. Diferenciar fixtures sintéticos de validação bancária real.
- Fazer commits locais pequenos e coerentes. Não dar push nem publicar sem autorização específica.
- Não incluir alterações locais preexistentes do checkout principal nesta branch automaticamente; elas estão preservadas no checkout original.
