# ADR-002 — Identidade bancária e fronteiras de restauração/classificação

Status: contrato de correção adotado após revisão independente; a conclusão executável é registrada em `../STATUS.md`.

Responsável: agente, dentro do escopo de desenvolvimento local autorizado por Sara. Não autoriza bancos reais, acesso remoto, publicação ou contratação.

## Contexto e evidência

A suíte inicial passou 33 testes e o build passou, mas a revisão independente reproduziu cinco defeitos adicionais: backup bancário aplicado ao restaurador legado, duplicação após troca de ID no mesmo item, pagamento de fatura contado como receita, regex de investimento anulando categoria explícita e parcela pendente futura deslocando o mês corrente.

O relatório e os probes originais permanecem em `C:/Users/sarai/AppData/Local/hermes/cache/scratch/pluggy-independent-review/`. São evidência dos defeitos anteriores, não testes de aprovação pós-correção. As regressões corrigidas ficam versionadas no projeto.

A documentação oficial de transações e da listagem por cursor foi recuperada diretamente com HTTP 200. Texto e metadados em `.evidence/official-transaction.txt`, `.evidence/official-cursor.txt` e `.evidence/official-id-contract.json`, privados ao checkout de desenvolvimento.

## Decisões

1. **Identidade não depende só do ID da Pluggy.** Preservar `providerId` e `providerCode`. A API pode recriar uma operação com outro ID durante uma atualização comum. Usar somente correspondência bancária não ambígua e escopada à conta para vincular versões; conservar auditoria e correções locais. Não confundir um código institucional com chave universalmente única.
2. **Ambiguidade não autoriza fusão.** Se duas operações distintas aparecem simultaneamente com identificadores incompatíveis/ambíguos, não as apagar por coincidência de valor, data ou descrição. Sem identificador confiável, a reconciliação automática não é garantida. Recriação em outro item continua fora deste incremento.
3. **Backup tem família e versão.** O restaurador legado valida o envelope e os registros antes de qualquer setter. Exportação bancária ou JSON incompleto deve gerar erro sem modificar histórico, categorias, regras ou carteira. A restauração bancária completa continua fora de escopo.
4. **Categoria efetiva controla efeito financeiro.** Categoria explícita compatível e correção manual não podem servir apenas como rótulo enquanto regex genérica transforma a mesma despesa em investimento/neutro. Preservar políticas explícitas de transferência própria, investimento e fatura.
5. **Pagamento de fatura não cria receita.** Reconhecer descritores documentados como `Statement Payment`, mantendo estornos e cashback distintos. Testar normalização e resumo em conjunto, não só um booleano isolado.
6. **Mês corrente usa relógio, não maior data do payload.** Fonte bancária usa referência temporal atual injetável em testes. Se o histórico usa a data do extrato como referência, apresentar isso explicitamente. Parcela futura pendente não muda a âncora do mês liquidado.

## Alternativas recusadas

- Apagar tudo o que não veio numa resposta: viola preservação de histórico diante de falhas ou respostas vazias.
- Fundir por descrição/valor/data: pode eliminar compras iguais legítimas.
- Confiar no cast TypeScript para validar JSON: tipos não validam arquivos em execução.
- Considerar todo crédito de cartão pagamento de fatura: confunde estorno/cashback e outras entradas.
- Tratar testes anteriores verdes como aprovação dos novos casos: os defeitos foram demonstrados fora daquela cobertura.

## Aceitação e limites

A correção deve demonstrar os cinco cenários em regressões, mais preservação de overrides, compras iguais distintas e migração de persistência quando necessária. A validação final repete suíte, build, fluxo HTTP local, verificação de segredos e Graphify. Nenhum resultado sintético estabelece cobertura, consentimento, histórico, sinais ou saldos reais dos bancos de Sara.

Fontes primárias:
- https://docs.pluggy.ai/en/docs/products/transactions
- https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor

## Detalhamento implementado e revisado em 12/11/2026

Reconciliação exige providerId textual não vazio em 1:1, lote completo e histórico ativo, dentro da mesma conta/item. Cópias divergentes do mesmo ID causam rollback; cópias idênticas são idempotentes. Colisões posteriores podem revogar inferências, sem apagar versões/correções. A migração v1 não inventa identificadores perdidos: é necessário reaprendê-los pelo ID original antes de ligar uma substituição.

Valores mantêm centavos inteiros; quando há `amountInAccountCurrency`, guardam-se centavos/moeda originais com sinal e `amountSource`. O valor original também deve ser válido. Datas civis impossíveis e vínculos de item/conta incompatíveis são recusados. `providerDate` conserva o timestamp/data original; o calendário exibido usa seu prefixo, sem aplicar GMT-3 silenciosamente. Janelas incluem 2/3/6/12 meses civis e terminam no primeiro dia do mês seguinte exclusivo.

O cliente local valida registros e respostas de mutação antes de aceitar sucesso. O hook usa geração monotônica para que resposta/erro de GET antigo não substitua o snapshot posterior à escrita. A revisão adicional independente não encontrou novo defeito material nessas correções. A regressão inicial de concorrência falhou por erro do harness; ela não é evidência de TDD. As demais lacunas novas têm RED/GREEN diretamente capturados; as cinco correções já existentes foram inspecionadas e exercitadas sem reintroduzir seus defeitos.

Aceite executável, commits, restrições e provas continuam em `../STATUS.md`.
