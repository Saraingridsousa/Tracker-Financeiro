# Conversão monetária de extratos — 18/11/2026

Implementação em `feat/meu-pluggy-sync`, worktree `Tracker-Financeiro-pluggy`. Foram usados o runner nativo do Node e as dependências existentes; `package.json` e o lockfile não foram alterados.

## Diagnóstico e causa raiz

O problema estava presente nesta branch: `safeNumber` removia o primeiro ponto e depois usava `parseFloat`. Isso convertia `85.50` em `8550` e podia ler `1,234.56` como `1.23`. Entradas vazias ou inválidas viravam zero. A função era chamada tanto pelo CSV genérico quanto pelo caminho de faturas Inter.

Excel e PDF tinham conversores semelhantes, removendo todos os pontos. No Excel isso também afetava células numéricas nativas, por exemplo `85.5` virava `855`. O PDF genérico podia extrair apenas a cauda de `1234,56`, perdendo o primeiro dígito. O OFX procurava campos com `=`, em vez de ler os elementos dos blocos `STMTTRN`.

## Correção

- `src/lib/parseMoney.ts`: validação completa, sem leitura parcial nem zero de fallback; sinais, zero, prefixos de moeda e agrupamentos válidos; montagem de centavos inteiros; rejeição de precisão adicional não nula, números não finitos e magnitudes sem precisão de centavos.
- CSV genérico aceita formatos inequívocos brasileiros e internacionais. `1.234` e `1,234` sem contexto são erros. Integrações podem informar `parseBankFile(file, { amountFormat: 'br' | 'international' })`.
- Faturas `inter-from-*.csv`, planilhas e layouts brasileiros de PDF mantêm contexto brasileiro para agrupamentos ambíguos. Formatos decimais inequívocos com ponto também são aceitos. Números nativos do Excel mantêm seu valor.
- OFX SGML/XML tem regra própria: ponto ou vírgula são decimais, nunca milhar; `1.000` significa um, e `1.234` é rejeitado por exigir precisão não suportada. Referência: [OFX Banking Specification, seção 3.2.9](https://financialdataexchange.org/wp-content/uploads/2025/12/OFX-Banking-Specification-v2.3.pdf).
- CSV estruturalmente inválido, valores ausentes e valores malformados rejeitam o arquivo. Excel exige coluna de valor reconhecida e não adivinha valores a partir de documentos ou saldos. PDF valida o token monetário completo, inclusive letras e sinais repetidos.
- `Transaction.amount` continua positivo com o sentido em `type`. Zero passa a ser preservado. Categorias, faturas, dados conectados e regras atuais de transferência própria permanecem; regressão específica impede reintroduzir identificação por nome.
- `tsconfig.app.json` permite imports explícitos `.ts`, compatíveis com o runner Node já adotado.

## Testes e apresentação

As novas regressões foram executadas antes do código de produção nesta branch, demonstrando as falhas, e novamente após as correções. São fixtures sintéticos; não houve sincronização externa, leitura de credenciais ou alteração de bases bancárias reais.

- `tests/money-parsing.test.mjs`: formatos pedidos, números positivos/negativos/zero, moedas, milhar, espaços, ambiguidade, vazios, lixo, precisão e OFX.
- `tests/bank-file-money.test.mjs`: CSV com ponto e vírgula, CSV com vírgula e campos entre aspas, fatura Inter, OFX SGML/XML, erros atômicos, categorias e transferência própria.
- `tests/excel-money.test.mjs`: bytes reais XLS/XLSX, células numéricas e textuais, zero, entradas inválidas e coluna ausente; a cobertura anterior de Excel também continua passando.
- `tests/pdf-money.test.mjs`: PDFs binários gerados em memória e realmente lidos pelo PDF.js; layouts genérico, Caixa e Inter; tokens malformados; renderização da tabela real React para importações CSV, Excel e PDF. No Node usa-se o build oficial `legacy` do PDF.js, sem mudar a aplicação.
- Totais calculados pela função de domínio existente: receita **R$ 1.234,56**, despesa **R$ 85,80**, saldo **R$ 1.148,76**; despesa individual exibida como **R$ 85,50**, sem inflar para R$ 8.550,00.

A interface desta branch oferece somente bancos conectados, conforme ADR 005. Não foram reintroduzidos uploads nem carteira manual. A apresentação foi verificada por renderização dos componentes reais e pela suíte de interface existente; não se afirma aceite visual interativo de importação nesta versão.

## Limites e achados adicionais

- Valores ambíguos de CSV genérico exigem configuração explícita da integração ou reexportação com duas casas decimais. A interface conectada não oferece seletor para importações legadas.
- PDFs digitalizados e layouts não reconhecidos continuam sem OCR/suporte. Valores com precisão adicional não nula são rejeitados, não arredondados.
- `server/money.mjs` já recebe apenas números finitos e converte em centavos; não contém remoção de separadores. Os cálculos do domínio já somam centavos. Esses caminhos corretos não foram alterados.
- `useInvestments.importAssetsFromCsv`, legado fora da interface atual, ainda divide linhas por vírgulas e usa `Number(...) || 0`: há risco para preços localizados ou inválidos. Não foi misturado à correção de extratos; quantidades e preços de ativos precisam de regras próprias de precisão.
- O conversor numérico não faz câmbio nem determina a moeda de uma transação. Esta correção não acrescenta suporte a extratos em múltiplas moedas.
- Não há correção automática de valores incorretos importados anteriormente. A conferência com o extrato original continua necessária.
- Não existe configuração/comando de lint no projeto. `npm run build` executa TypeScript da aplicação e configuração Node, além do Vite.

O resultado final dos comandos e o histórico desta etapa constam em `docs/STATUS.md`. Não houve push.
