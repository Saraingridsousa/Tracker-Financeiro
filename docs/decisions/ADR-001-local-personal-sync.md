# ADR-001 — Backend local e sincronização pessoal

Status: adotada para o primeiro incremento técnico, sem decisão sobre implantação remota.

## Decisão

Manter React/TypeScript. Acrescentar Node com HTTP e SQLite nativos, disponível no ambiente verificado, para não colocar API keys no cliente nem exigir compilação de dependências SQLite no Windows. Documentar que node:sqlite ainda emite aviso experimental em Node 22.

Somente loopback, proteção Host/Origin/CSRF e dados em diretório de aplicação fora do checkout. Configuração do provedor via ambiente/arquivo local ignorado. Nenhuma credencial real será configurada pelo agente nesta etapa.

Registrar os itemIds conhecidos da modalidade MeuPluggy, sem enumeração nem criação direta de itens bancários. Usar `/v2/transactions` por cursor e não a rota paginada antiga, em descontinuação.

## Alternativas

- Frontend chamando Pluggy diretamente: recusado por exposição de credenciais e escopo limitado do Connect Token.
- Reescrever toda a interface em Python: desnecessário para o objetivo.
- Hospedagem pública: adiada até definição de acesso e autenticação.
- Instalar extensão SQLite nativa: evitada neste incremento para reduzir a fragilidade no Windows.

## Consequências

O PC precisa estar executando o app para receber consultas locais. A atualização do banco continua no ritmo da Pluggy, não do botão do Tracker. A integração tem terceiro envolvido mesmo com banco local. Dados importados anteriormente ficam separados até migração/reconciliação explícita; não misturar fontes com uma deduplicação por descrição/valor.

As alterações não commitadas de investimentos no checkout principal não são abrangidas por esta branch; precisam de integração posterior com revisão.
