# ADR 005 — política dos investimentos conectados e abas

17/11/2026. Contexto: PG-004. Documentação oficial Pluggy consultada nesta data (referência Investments e objeto Investment): `balance` é o saldo líquido atual (após taxas/impostos), `amount` é o valor bruto, `amountOriginal` o valor aplicado, `amountProfit` o lucro líquido informado (nulo em conectores Open Finance), `date` a data de referência do valor, `quantity` a quantidade informada, `dueDate` o vencimento e `status` ∈ `ACTIVE`, `PENDING`, `TOTAL_WITHDRAWAL`. Tipos `FIXED_INCOME`, `EQUITY`, `MUTUAL_FUND`, `SECURITY`, `ETF`, `COE` com subtipos (CDB, TREASURY, STOCK, BDR, REAL_ESTATE_FUND…).

## Decisões

1. **Sem mudança de backend.** O adaptador já preserva `balance`, `amount`, `amountOriginal`, `amountProfit`, `quantity`, `date`, `dueDate`, `status`, `type`, `subtype` e `code`. O tipo do frontend passa a declarar `code`. Emissor, taxas e indexadores não são usados e não foram adicionados.
2. **Identidade**: `id` = itemId + providerId (já gerado pelo backend). Nome/ticker nunca identificam. O seletor deduplica por `id`, mantendo a observação mais recente. Mesmo produto vindo de dois itens permanece separado.
3. **Situação** (por registro):
   - `ACTIVE` retornado na última leitura → **posição atual**, entra no valor atual.
   - `PENDING` → pendente, exibido e **fora** do total.
   - `TOTAL_WITHDRAWAL` → resgatado/encerrado, somente histórico.
   - Qualquer outro valor (inclusive `UNKNOWN` gerado pelo backend) → **situação desconhecida**, fora do total e sinalizado.
   - Registro cuja `observedAt` é anterior à última leitura bem-sucedida da conexão quando a leitura de investimentos terminou `available`/`empty` → **não retornado na última leitura**, fora do total (o backend não apaga ausências).
   - Se a leitura de investimentos da conexão terminou `error`/`unavailable`, os registros preservados continuam com o último valor conhecido, marcados como preservados, e a cobertura é **parcial**.
4. **Valor atual** = soma de `balanceCents` das posições atuais, **por moeda**. O valor principal é BRL; outras moedas aparecem separadas, sem conversão.
5. **Campos**: valor atual (`balance`, líquido) é distinto de bruto (`amount`), aplicado (`amountOriginal`) e resultado informado (`amountProfit`). Nada é derivado: sem rentabilidade calculada, preço médio ou ordens. Ausente → “não informado”.
6. **Classe** = tipo + subtipo traduzidos. `EQUITY` sem subtipo é “Renda variável · subtipo não informado”, nunca “Ações”.
7. **Instituição** = apelido da conexão; a interface informa se a instituição foi confirmada pelas contas ou é apenas apelido. Item sem contas (Sofisa) aparece normalmente.
8. **Cobertura** por conexão: completa, vazia, erro, indisponível ou não consultada; conexão com `lastError` também conta como parcial. Leitura mais recente com mais de 48 h → dados antigos.
9. **Carteiras separadas**: conectada e manual nunca são somadas; edição manual não altera dados do banco; conectados não viram ativos manuais.
10. **Card da Visão Geral**: no modo bancos conectados usa o mesmo resumo do seletor (mesmo objeto passado à aba Investimentos); sem conexões/não consultado mostra “—” com explicação; carregando mostra “Carregando…”. No modo histórico importado permanece o valor atual da carteira manual, rotulado.
11. **Abas**: estado bancário fica no `useBanking` do App; abas são renderização condicional sem efeitos de rede. Conteúdo da Visão Geral permanece no App (testes existentes inspecionam a árvore); novas áreas são componentes pequenos.
