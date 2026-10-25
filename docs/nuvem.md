# Operação em produção — 24/10/2026

Painel e API: **https://apuracao-presidente-2026.phdtemiranda.workers.dev/**

Repositório público: **https://github.com/magisph/apuracao-presidente-2026**

Frontend em Workers Static Assets, API no mesmo Worker e persistência em D1. Coordenador e cinco grupos executam em runners Ubuntu do GitHub Actions. Não foi contratado plano pago nem alterado qualquer recurso dos demais projetos da conta.

## Configuração vigente

- Worker/D1: `apuracao-presidente-2026`; configuração em `worker/wrangler.toml`.
- `INGEST_TOKEN` está configurado como secret no Worker e no GitHub. Seu valor não consta no código/commits.
- Variables do repositório: `INGEST_URL`, `BASE_URL`, `BASE_SHA256`, `CHAIN_ENABLED=true`, `COLLECTION_DEADLINE_UTC=2026-10-26T12:00:00Z`.
- A base gzip é baixada da Release, descomprimida e validada por SHA-256 em cada runner. Nenhum dado eleitoral é sintetizado para produção.
- SHA-256 do JSON: `2d2f46c70fff94782d60e8ee6b66e39b83b457ade6010414c345e9a2b15d61ff`.
- Base: https://github.com/magisph/apuracao-presidente-2026/releases/tag/base-20261024-2d2f46c70fff
- Encadeamento usa GITHUB_TOKEN efêmero com `actions:write` somente no job de continuação. Não usa token pessoal permanente.
- Prazo final: **26/10/2026 às 9h de Brasília**. Cada processo limita sua duração pelo menor entre 345 min e o prazo absoluto; verificações impedem iniciar ciclos após o prazo. O sinal de prazo também cancela HTTP em andamento e impede novas requisições.

## Verificado no ambiente externo

1. CI Linux/Node 24: 59 testes, build e auditoria aprovados.
2. Ensaio curto com seis jobs concluído; outra execução retomou com novas épocas de lease.
3. Encadeamento do segundo ensaio disparou automaticamente a operação de 345 min. No ensaio, os owners persistidos no D1 identificaram a execução 40106029417, sem processo coletor neste PC.
4. Snapshot real de pré-apuração e 71 blobs municipais publicados no D1. Resultado oficial retornou zero votos; não houve validação de precisão com votos reais de 2T.
5. Ingestão sem credencial rejeitada401; lote administrativo sem votos: criação201, reenvio200, conflito409 e epoch antiga409. Snapshot com páginas inexistentes rejeitado409, mantendo o último publicado.
6. Navegador abriu o painel público e carregou Acre→Porto Walter, com 22 municípios e malha correspondente.
7. Consulta de Analytics inicial: 145 invocações do Worker, zero erros; CPU P50=3,874ms eP99=10,481ms. A documentação admite rollover de CPU; essa amostra não prova o comportamento no pico eleitoral.

## Continuidade, custo e limites

Projeções são publicadas nominalmente a cada 90 s; EA20 nacional/heartbeat a cada 15 s; grupos até 15 requisições/s, coordenador até 5. Heartbeats dos grupos a cada 60 s. Falhas usam retry/backoff, circuito de 403, cooldown de 404 e respeito a 429.

Actions não garante disponibilidade contínua: filas e retomada de leases podem produzir lacunas. O diagnóstico sinaliza atrasos; nunca apresentar o relógio de transporte como se fosse atualização dos votos. Artefatos limitados a outbox/saúde por 2 dias, sem repetir a base ou o ledger inteiro em cada execução.

Estimativa local anterior: cerca de 273 MB de dados, 71 mil escritas D1 e 74 mil requisições dinâmicas/dia para o cenário descrito em `data/storage-budget.json`.

**Medido em 24/10 (tarde), `wrangler d1 info`, janela de 24 h:** produção 2.685 linhas escritas e 14.386 lidas em cerca de 2,5 h de operação pré-apuração (heartbeats e leases, ≈1.100 escritas/h); D1 de ensaio 16.021 escritas após o pico nacional completo; o outro banco da conta, 0 escritas. Uma publicação completa (71 páginas, blobs, snapshot) custa cerca de 134 linhas; um lote de BUs, cerca de 3,8.

**Projeção para o dia UTC 25/10:** ≈26 mil (heartbeats/leases) + ≤21 mil (até 160 publicações entre 20:00 e 23:59 UTC) + 16–20 mil (lotes) ≈ 63–67 mil linhas, abaixo do limiar de decisão de 70 mil e do limite de 100 mil. Decisão: manter publicação a cada 90 s. O reset às 00:00 UTC (21h de Brasília) divide a noite eleitoral. Se a cota se esgotar, o Worker responde 400 `request rejected` (seu tratamento genérico de exceções, inclusive do D1); desde esta rodada os coletores classificam essa resposta como transitória e não terminam por isso — recuam com backoff, preservam lotes na outbox e retomam após o reset.

**Pico nacional verificado em ambiente isolado (24/10, run `peak-1792863040184`):** mesmo código do Worker em `apuracao-presidente-2026-peak-20261024`; 499.248 registros em 3.902 lotes (1.472 registros/s), recuperação nacional em 42 s com totais iguais, 800 leituras concorrentes, todas as respostas 2xx. Publicação municipal concorrente (4 páginas): 11,9 s a 10% e 11,3 s a 100%, contra 89,7 s e 35,9 s no envio sequencial. Nenhum dado sintético foi enviado à produção.

**Não verificado:** desligamento físico deste PC (fora de escopo por decisão do usuário) e o pico real de 25/10. A execução efetiva em runners remotos foi comprovada. Precisão nacional/cobertura95% continuam bloqueadas; vencedor estatístico e probabilidade numérica permanecem desabilitados.

## Operação e nova publicação

Cada job executa `npm run collect:supervised`: se o coletor terminar com erro, o supervisor o reinicia em 30 s com o tempo restante do ciclo; saída normal (prazo) encerra. Respostas 5xx/429, 400 `request rejected` (exceção interna, inclusive falha do D1) e falhas de rede não encerram mais o processo (backoff até 60 s); demais 4xx, cercamento de lease e divergência de base continuam fatais.

**Realinhamento em 25/10:** a troca de ciclo natural cairia por volta de 17h25 de Brasília. Às 15h15 de Brasília cancelar o run em andamento; se o job de continuação disparar um novo run de 345 min, usá-lo; senão disparar manualmente. O ciclo resultante cobre aproximadamente 15h20–21h05 de Brasília.

Consultar o workflow Coleta eleitoral para estado dos jobs. Para iniciar outra janela: `workflow_dispatch`, duração 345 min, continuação ligada e prazo futuro explícito. Para encerrar a operação: desabilitar o workflow Coleta eleitoral e cancelar as execuções ativas. A variable `CHAIN_ENABLED=false` vale para execuções que carregarem a nova configuração; uma execução já iniciada pode manter o valor anterior e disparar mais um ciclo. O prazo absoluto continua obrigatório.

Nova versão: `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npx wrangler@4.152.0 deploy --config worker/wrangler.toml --dry-run`, revisão do alvo e então o mesmo comando sem `--dry-run`. CLI deve estar autenticada na conta configurada. Nunca colocar credenciais no frontend ou no TOML.

Fontes: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/), [encadeamento com GITHUB_TOKEN](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Atualização publicada — 24/10 às 23h04 de Brasília

Modo municipal e seis correções da revisão integral publicados após autorização: código `455bcaa69c42bbdeb2bcacbe0ccf38715f0b88a0`, CI `40152712705` aprovado com **115 testes**, build e auditoria. Worker na versão `d06d6592-1c84-446b-961d-a00c62f205a6`; base/D1/segredos preservados, sem migração ou dados sintéticos.

O run antigo `40133213187` terminou e a continuação criou `40152941861` na revisão corrigida. Coordenador e cinco grupos possuem leases do run novo. Snapshot real `live-14` e `/api/health` conferidos: modelo `f1835080b0161880fda5245692f356b711a7cdb35ed68da5c7a28a0cb6b41cbd`, estado `ok`, fila zero, cinco grupos saudáveis. Assets remotos conferem com o build; navegação municipal e comparação histórica foram verificadas no navegador público.

O transporte novo monta atualizações completas antes de aplicar BUs/estimativas/retiradas e persiste fragmentos pendentes junto aos cursores. Não operar um coordenador antigo com produtores municipais novos. Os choques 0,03/0,035 são provisórios; vencedor/probabilidade estatística continuam indisponíveis. Detalhes, evidências e versão anterior para rollback em `docs/publicacao-municipal-2026-10-24.md`. O lembrete de realinhamento às 15h15 de 25/10 e o prazo final existente foram preservados.

Os horários de troca natural citados anteriormente correspondiam aos runs anteriores. Após este reinício, conferir a execução vigente no realinhamento de 15h15; a duração de cada ciclo continua em 345 min, com possíveis filas e retomada de leases.
