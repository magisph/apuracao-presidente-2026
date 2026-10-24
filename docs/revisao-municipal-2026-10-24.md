# Revisão e calibração do modo municipal — 24/10/2026

Preparação local no branch `modo-municipal`, baseada em `main=d6eaf57`. Merge, push e primeira publicação dependem da confirmação solicitada pelo usuário. Nenhum dado de teste foi enviado à produção e nenhum banco foi apagado.

## Revisão independente

Um revisor independente, somente leitura e sem Astra, examinou o branch no HEAD inicial `47dd11c`, executou 22 testes direcionados e apontou seis grupos importantes, sem achados críticos. O parecer inicial bloqueava o merge; os achados receberam uma rodada de correções e regressões RED→GREEN, seguida da suíte completa. Não foi feita segunda revisão independente após os ajustes.

| Achado | Correção e verificação |
|---|---|
| Um município grande gerava lote acima de 90.000 bytes | Lotes de até 1.024 observações, subdivididos por tamanho comprimido, reservando espaço para o envelope. Regressão executa o coletor com 5.000 seções e transporte que rejeita mais de 90.000 bytes; todos os registros atravessam até seis lotes aceitos. Outbox mantém os IDs idempotentes. Recuperação solicita dez lotes por página; API preserva padrão legado de 100. |
| BU posterior causava dupla contagem ou soma municipal divergente | Nova reconciliação após alteração de BU real; versões derivadas monotônicas evitam conflito no mesmo relógio do parcial. Parcial incompatível retira estimativas e permanece pendente. Regressão reproduz chegada em seção fora do conjunto inicialmente estimado e mantém A=220/B=200, sem terceiro registro indevido. |
| Inventário indisponível bloqueava o fallback | Falha do inventário é isolada; andamento e EA20 municipal continuam processados com ordem alternativa. Diagnóstico registra degradação. Teste com inventário retornando indisponibilidade mantém observação municipal. |
| Correção para zero e retirada na configuração não eram refletidas | Zero pode enfileirar retirada de estimativas; conjunto configurado é substituído por UF, preservando outras UFs. Testes cobrem retirada e atualização de conjunto. |
| EA20 defasado era confirmado como atualização terminal | Linha do andamento permanece na fila até compatibilidade de quantidade e horário. Teste entrega st=1 e depois st=2 sem mudar andamento; resultado posterior é incorporado. |
| Projeção abaixo de 1% aparecia fora dos cartões | Política compartilhada oculta ponto/faixa também no gráfico, mapa, tooltip e lista. Regressão preserva os dados originais e remove apenas a projeção de exibição; navegador com fixture local em 0,5% confirmou todas as superfícies ocultas. |

Terminologia operacional foi ajustada para distinguir observações municipais estimadas e BUs. A regra de precedência do BU real permanece explícita. Não foi alterado o estimador pontual, sua hierarquia, a mistura ou a regra de vencedor.

## Calibração provisória da faixa

Varredura nacional de 2022 repetida com `HOLDOUT_SHOCKS=0.03:0.035,0.045:0.05,0.07:0.07,0.1:0.1`, 400 réplicas e semente 20261025. Modo municipal usa a ordem de recebimento do primeiro turno de 2022, sem informação privilegiada da ordem real do segundo turno.

Os quatro pares passaram em todos os sete checkpoints abaixo de 100% nos dois modos. Foi escolhido o **menor par da grade: nacional 0,03 e UF 0,035**, ambos multiplicados por √(fração de eleitorado restante). Resultado e proveniência do ensaio estão em `config/calibracao-faixa-2022.json`; saída integral em `data/holdout-national-2022/report-calibration.json`.

| Checkpoint do replay | Erro seção (pp) | Largura seção (pp) | Erro municipal (pp) | Largura municipal (pp) |
|---|---:|---:|---:|---:|
| 1% | 0,470 | 3,250 | 0,491 | 4,113 |
| 3% | 0,294 | 2,862 | 0,463 | 3,925 |
| 5% | 0,187 | 2,488 | 0,448 | 3,466 |
| 10% | 0,136 | 2,502 | 0,477 | 2,971 |
| 15% | 0,130 | 2,223 | 0,622 | 2,590 |
| 20% | 0,112 | 2,143 | 0,624 | 2,279 |
| 50% | 0,025 | 0,981 | 0,286 | 1,057 |

Cada linha cobriu a verdade nos dois modos: 14 verificações atendidas. Os checkpoints são frações da sequência de eventos do replay; não são percentuais exatos do eleitorado ponderado da interface.

Não se usa o ponto de 100% para selecionar choques: a faixa já colapsou, mas há diferença residual entre o universo histórico modelado e a verdade completa (aproximadamente 0,0000593 pp em seção e 0,00000258 pp no modo municipal). Isso não foi escondido nem corrigido alterando a estimativa central.

**Limitação:** a mesma eleição de 2022 foi usada para escolher parâmetros e medir cobertura. Isso é calibração retrospectiva provisória, não validação independente nem garantia de cobertura futura de 95%. Vencedor estatístico e probabilidade de vitória continuam desabilitados. A comparação do código confirmou que, na rodada atual, `model.ts` mudou exclusivamente os dois valores padrão de choque.

## Verificação local e autorização

- `npm test`: **98 testes aprovados, zero falhas** (`data/tests-municipal-final.log`), incluindo a correção posterior do formato de datas do gerador e os limites de recuperação.
- `npm run build`: TypeScript e build Vite aprovados (`data/build-municipal-final.log`).
- `git diff --check`: sem erros de whitespace.
- Interface: ensaio local isolado em `127.0.0.1:4271`; aba e processo auxiliar encerrados após conferência.
- Produção consultada no início: estado `ok`, filas zero, run `40133213187` na revisão `d6eaf57`, iniciado em 24/10 às 18h12 de Brasília; CI `40118693175` aprovado.
- Lembrete criado para 25/10 às 15h15 de Brasília, apenas para avisar sobre realinhamento, sem cancelar ou disparar jobs automaticamente.

A conferência da primeira geração identificou 499.248 ordens ausentes: as datas de 2026 estão em ISO e o gerador aceitava apenas formato brasileiro. Esse arquivo inválido não foi commitado. A correção recebeu regressões RED→GREEN para os dois formatos, seções agregadas e identidade. A geração corrigida usa segundos Unix (incluindo recebimentos antes das 17h) e caches verificados por UF. A integridade, commit e estado final serão registrados em `docs/progresso-modo-municipal-2026-10-24.md`. A próxima ação externa só ocorrerá após confirmação do usuário para merge/push e publicação.

**Conferência final da ordem:** concluída, commit `1764255`. Gzip de 1.142.269 bytes, SHA-256 `079bae7eeec2405ed2b8aa41caa325c03901d309d941537cb48d43d65d73cf4a`; base vinculada `2d2f46c70fff94782d60e8ee6b66e39b83b457ade6010414c345e9a2b15d61ff`. Todas as 499.206 unidades com histórico possuem ordem; as 42 restantes permanecem fora do modelo. Dry-run da API e assets aprovado, sem publicação efetiva.
