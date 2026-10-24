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

## Rodada de 24/10/2026 (tarde)

- **Holdout nacional 2022** (`scripts/holdout-national.ts`, modelo congelado `5ae9c873…02ae3`, sem ajuste de parâmetros): 56 arquivos oficiais (27 UFs e exterior × 2 turnos) com SHA-512 conferido; 472.028 eventos aceitos, 0 rejeitados, 49.710 diferenças de eleitorado registradas. Erro absoluto da participação de 13 nos válidos: 0,470 pp a 1%; 0,294 a 3%; 0,187 a 5%; 0,136 a 10%; 0,130 a 15%; 0,112 a 20%; 0,025 a 50%; 0 a 100% (igualdade contábil). A faixa nominal de 95% conteve o resultado em todos os pontos abaixo de 100%, mas com largura de 14,8–17,2 pp até 20% e 8,8 pp a 50%: conservadora demais para ser informativa. Uma eleição, ordem reconstruída pelos recibos finais; `calibrationSufficient=false`.
- **Teste real ponta a ponta** (`scripts/e2e-real.ts`): todos os 2.270 BUs do Acre no 1º turno de 2026 baixados e decodificados pelo mesmo transporte da produção (EA16 → auxiliar EA18 assinado → BU → BER), a 5 req/s, sem falhas. Votos de 13 (134.770), 22 (302.807), brancos (5.579), nulos (13.662) e seções totalizadas (2.270) idênticos ao EA20 assinado. Os votos nominais a outros candidatos incluem 23 votos que o TSE reclassifica como nulos técnicos (`vnt`). Lotes enviados ao Worker isolado e recuperados com somas iguais.
- **Pico nacional isolado:** ver [nuvem.md](nuvem.md). Publicação municipal agora usa concorrência limitada a 4 páginas (`src/collector/publication.ts`), com ordem de hashes e publicação atômica preservadas.
- **Resiliência:** erros transitórios de ingestão (5xx/429/rede) não encerram coletores; supervisor (`scripts/supervise.ts`) reinicia processos encerrados com erro dentro do ciclo.

## Bloqueado / Não verificado

- **Precisão nacional: Bloqueado.** O holdout nacional de 2022 mediu erro pontual baixo em uma eleição, mas não há replay temporal real com versões/correções nem validação entre eleições. A cobertura de 95% não está calibrada (faixa observada larga demais). Os ensaios de 2014/2018 não foram executados. Probabilidade e selo estatístico de vencedor permanecem desabilitados.
- **Nuvem publicada:** gravação/leitura D1, autenticação, rejeição de conflitos, publicação incompleta, retomada de runners e encadeamento foram verificados. CI Linux/Node24 passou. Carga eleitoral completa e desligamento físico do PC continuam não verificados. Evidências atuais em [nuvem](nuvem.md).
- A visão municipal não integra EA20 municipal; oferece projeção hierárquica e comparação histórica. Apuração oficial do mapa permanece por UF.
- A assinatura JWS é verificada com chave oficial fixada. Não se afirma verificação de cadeia X.509/LCR ou da assinatura interna dos BUs.

## Artefatos

`data/benchmark.json`, `data/storage-budget.json`, `data/holdout-ac-2022.json`, `data/stress.json`, checkpoints, snapshots e logs contêm as evidências locais. `docs/evidencias/manifest.json` identifica os hashes finais. `data/` permanece excluído do futuro Git público.
