# Correções da revisão integral

Escopo: corrigir os achados da revisão, preservar dados e validar localmente. Publicação Git/Cloudflare continua sendo etapa externa separada.

1. Entrega: outbox durável, IDs estáveis, retry e recuperação após falha/timeout/reinício, com teste RED → GREEN.
2. Saúde: preservar falhas declaradas, distinguir heartbeat recente de coleta íntegra e testar o coordenador.
3. Modelo: um ajuste nacional, previsões por unidade agregadas para UF/município e intervalos coerentes; testar soma e territórios sem observação.
4. Avaliação: replay histórico pelo ledger operacional, divergências explícitas e verdade completa; manter gate de precisão independente.
5. Proveniência: hashes por estágio, atualizar/verificar derivados finais e preservar base anterior.
6. Replay: paginação completa, preservação de seleção e proteção contra respostas atrasadas; testes e navegador.
7. Verificação: suíte, build, auditoria, medições atualizadas, revisão independente e relatório com gates externos explícitos.

Ruling: workspace sem Git; usar este plano e docs/progresso-correcao.md como registro, sem commit/worktree.
Ruling: não alterar a política de eleitorado por suposição; avaliar e reportar seu efeito pelo mesmo ledger, sem apresentar diferenças legítimas como votos inválidos.
Ruling: nenhuma alteração local comprova disponibilidade ou precisão nacional; gates dependem de evidência apropriada.
