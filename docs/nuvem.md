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

Estimativa local: cerca de 273 MB de dados, 71 mil escritas D1 e 74 mil requisições dinâmicas/dia para o cenário descrito em `data/storage-budget.json`. Quotas são compartilhadas com a conta e dependem de uso, correções, retries e público. O D1 após os ensaios ocupava menos de 1 MB; isso é pré-apuração, não ensaio completo de carga.

**Não verificado:** desligamento físico deste PC e comportamento sob o pico completo de BUs. A execução efetiva em runners remotos foi comprovada. Precisão nacional/cobertura95% continuam bloqueadas; vencedor estatístico e probabilidade numérica permanecem desabilitados.

## Operação e nova publicação

Consultar o workflow Coleta eleitoral para estado dos jobs. Para iniciar outra janela: `workflow_dispatch`, duração 345 min, continuação ligada e prazo futuro explícito. Para encerrar o encadeamento: variable `CHAIN_ENABLED=false`; uma execução já iniciada continua até seu limite ou cancelamento explícito.

Nova versão: `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npx wrangler@4.152.0 deploy --config worker/wrangler.toml --dry-run`, revisão do alvo e então o mesmo comando sem `--dry-run`. CLI deve estar autenticada na conta configurada. Nunca colocar credenciais no frontend ou no TOML.

Fontes: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/), [encadeamento com GITHUB_TOKEN](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
