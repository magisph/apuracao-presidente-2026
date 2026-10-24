# Operação independente do PC — preparada, ainda não publicada

O desenho usa repositório público GitHub, Actions com processos contínuos e Cloudflare Worker/D1. Não usa Docker. Nenhum recurso externo foi criado nesta implementação. A preferência por repositório público foi registrada; publicação Git e provisionamento ainda exigem autorização explícita.

## Artefatos prontos para revisão

- `worker/index.ts`: leituras públicas e ingestão autenticada.
- `worker/schema.sql`: leases com fencing, lotes imutáveis, snapshots, páginas municipais e heartbeat.
- `worker/wrangler.toml.example`: configuração sem conta, segredo ou identificador real.
- `.github/workflows/collect.yml`: coordenador e cinco coletores, jobs de 345 minutos e encadeamento opcional até prazo explícito.
- `dist/`: frontend estático compilado. Configurar `VITE_API_BASE` com a URL do Worker antes do build de publicação.

## Gate de publicação

Após autorização, criar repositório público, D1 e Worker; aplicar o schema somente no banco novo identificado; configurar `INGEST_TOKEN` como secret e `ORIGIN` como o endereço do painel. Publicar o frontend estático. Nada disso foi executado.

GitHub variables: `INGEST_URL`, `BASE_URL`, `BASE_SHA256`. A base deve estar congelada, conferida e disponível por HTTPS. GitHub secrets: `INGEST_TOKEN`; para encadear execuções, `CHAIN_TOKEN` com permissão restrita de Actions no repositório. `CHAIN_ENABLED=true` e `COLLECTION_DEADLINE_UTC` são obrigatórios para continuidade. Manter encadeamento desligado até o primeiro ensaio no runner real.

Sem `BASE_URL`/hash, apenas o coordenador consegue consultar EA20; os grupos de BU encerram com Bloqueado. Não usar cron como relógio de apuração. O encadeamento pode ter lacunas por fila/indisponibilidade do GitHub: checkpoints permitem retomada, mas o código sozinho não garante continuidade.

## Evidência exigida no ambiente externo

1. Gravação e leitura reais do D1; reenvio idempotente; publicação incompleta municipal rejeitada.
2. Interromper e reiniciar jobs, confirmar restauração e fencing de processo antigo.
3. Conferir snapshot com navegador fechado e depois PC desligado.
4. Medir atraso por fonte, profundidade da fila, throughput, CPU, requisições e linhas D1 lidas/escritas. Confrontar os limites atuais da conta e a janela completa de apuração.
5. Estimar armazenamento para a semana. Snapshots eleitorais só mudam quando o conteúdo muda; verificações sem alteração geram heartbeat, sem duplicar todo o histórico.
6. Registrar URL publicada, hash da base/modelo/configuração, execução GitHub e resultado dos checks.

O limite configurado é de 15 requisições/s por grupo e 5 no coordenador, total 80. Retries e auxiliares passam pelo mesmo limitador. Não se pressupõe IP diferente por runner. 403 abre circuito por dez minutos; 429 respeita Retry-After; 404 tem cooldown.

Publicação inicial: `PUBLISH_INTERVAL_MS=90000`; consulta nacional e heartbeat do coordenador nominalmente a cada15s. O dado oficial mais recente acompanha o heartbeat em modo ao vivo; replay usa somente as versões imutáveis. Coletores agrupam até128 observações por lote e enviam heartbeat a cada60s. O coordenador lê o fluxo global incremental em uma chamada por página. Páginas municipais são gzip/Base64, deduplicadas por SHA-256 e referenciadas no manifesto do snapshot, sem repetir o conteúdo de páginas intactas.

Dimensionamento local: 5.757 municípios/localidades do exterior, 71 páginas; cenário com observações sintéticas e6h de mudanças, todas as páginas mudando em todas as versões, gerou estimativa de272.869.660bytes de dados,71.223linhas escritas e74.461requisições em24h, com um visualizador. É estimativa, sem CPU real, índices medidos, tráfego adicional ou amplificação de retries. Limite de500MB por banco D1Free confirmado na documentação oficial; conferir também os limites da conta antes de publicar. O gate externo continua obrigatório.

Não executar preparação de bases em paralelo com a coleta eleitoral. Não afirmar que o plano gratuito suporta a operação sem medição. A aprovação de um teste SQLite local não comprova quotas, durabilidade ou disponibilidade do D1 publicado.

Após a revisão: coletores mantêm outbox durável em `data/outbox-*.json`, com ID/payload estáveis até confirmação. Falhas usam backoff de até60s. Se o runner termina antes da confirmação, a execução seguinte também pode recolher a seção a partir do inventário, pois a restauração remota só contém lotes confirmados. Heartbeat recente não elimina erros/quarentenas declarados.

Replay inicial carrega as páginas anteriores do histórico; atualizações reaproveitam o cache. Leituras municipais adicionais e repetições por falhas precisam entrar na medição real de quota. Documentação oficial consultada em24/10/2026: Workers Free100.000requisições/dia,10msCPU/requisição; D1Free500MB/banco. [Workers](https://developers.cloudflare.com/workers/platform/limits/) · [D1](https://developers.cloudflare.com/d1/platform/limits/).
