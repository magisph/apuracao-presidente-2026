# Validação local — correções de 24/10/2026

Os defeitos de código identificados na revisão foram tratados. Precisão nacional e operação externa continuam sujeitas aos gates abaixo. O relatório completo está em [revisao-corrigida.md](revisao-corrigida.md).

## Evidências da correção

- A suíte inclui testes de outbox, reinício do processo real do coletor, saúde declarada, agregação coerente, avaliação pelo ledger, hashes finais e paginação de 365 versões. Contagem final e comandos constam no manifesto e relatório após a revisão independente.
- TypeScript, build de produção e npm audit foram executados. O manifesto atualizado registra os resultados finais.
- Base: 499.248 unidades, 499.206 correspondências, 42 sem histórico e eleitorado individual null. Referência histórica conhecida: 158.745.007; eleitorado oficial: 158.745.502. Não se atribui causa automática às diferenças.
- Os 28 hashes de derivados finais foram recalculados e verificados, preservando os hashes do estágio histórico. A base anterior está em data/review-backup-20261024/data/base.json, fora do futuro versionamento público.
- Coleta real nacional/UF assinada retornou pré-apuração, zero votos e projeção indisponível. Isso não testa carga eleitoral ou precisão.
- AC2022 passou pelo ledger operacional: 2.124 unidades aceitas, nenhuma rejeitada, 210 diferenças de eleitorado auditadas; soma final exata. Ordem reconstruída de arquivos finais não equivale a histórico completo de versões.
- Benchmark nacional com 4.993 observações sintéticas e 400 réplicas, incluindo os agregados territoriais: aproximadamente 8,8 s e 581 MB RSS. Diferença de soma UF/BR inferior a 0,001 voto, por ponto flutuante.
- Orçamento atualizado: aproximadamente 273 MB de dados, 71.223 linhas escritas e 74.461 requisições/dia no cenário descrito. Requisição municipal máxima medida: 62.920 bytes. Estimativas não incluem índices/CPU reais e amplificação de falhas.

## Bloqueado / Não verificado

- **Precisão nacional: Bloqueado.** Falta holdout nacional independente e replay temporal real com versões/correções. O teste AC2022 e o stress sintético não comprovam cobertura nacional de 95%. Os ensaios de 2014/2018 não foram executados. Probabilidade e selo estatístico de vencedor permanecem desabilitados.
- **Nuvem: Não verificada.** Nenhum repo, Worker ou D1 foi publicado. CPU, quotas da conta, persistência e retomada externas, disponibilidade dos runners e PC desligado exigem ensaio real autorizado.
- A visão municipal não integra EA20 municipal; oferece projeção hierárquica e comparação histórica. Apuração oficial do mapa permanece por UF.
- A assinatura JWS é verificada com chave oficial fixada. Não se afirma verificação de cadeia X.509/LCR ou da assinatura interna dos BUs.

## Artefatos

`data/benchmark.json`, `data/storage-budget.json`, `data/holdout-ac-2022.json`, `data/stress.json`, checkpoints, snapshots e logs contêm as evidências locais. `docs/evidencias/manifest.json` identifica os hashes finais. `data/` permanece excluído do futuro Git público.
