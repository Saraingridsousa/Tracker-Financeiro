# ADR 003 — ingresso privado e documento central

Data: 16/11/2026. Estado: aceito para implementação; ativação real pendente.

Escolha: Tailscale Serve opcional, backend em loopback, origem privada HTTPS exata e Tailscale-User-Login do proprietário. Em modo privado todas as rotas exigem essa identidade; nenhum fallback anônimo. Não abrir porta LAN nem publicar. PC e celular usam a mesma URL privada. Vite fica restrito ao desenvolvimento local sem esse modo.

Histórico e carteira do navegador passam a ter cópia central explícita num documento SQLite com revisão monotônica. Validação legada compartilhada entre frontend/backend; CAS impede que um aparelho sobrescreva estado carregado antes de outra alteração. Edições de um evento são agrupadas num único documento. Erro preserva rascunho para exportação; atualização explícita descarta-o apenas após aviso.

Banco de dados passa a versão 3; exportação bancária continua no formato 2, independente do documento legado e da versão interna SQLite. Migração não modifica registros financeiros anteriores.

Consequências: PC deve estar ligado, sem suspensão, e ambos os aparelhos autenticados na rede privada. Não há push em tempo real. A cópia local antiga não é apagada, mas backups e importação têm de ser conferidos ao mudar de origem HTTP para HTTPS. Ativação requer a participação da proprietária no login Tailscale e nos bancos; não se pede credencial no chat.
