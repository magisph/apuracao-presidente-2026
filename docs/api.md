# Contratos v1

Todos os snapshots têm `schemaVersion=1`, identidade `{election:"6258",round:2,office:"0001",candidates:["13","22"]}`, sequência monotônica, modo explícito e horários de fonte/coleta. `Projection` não disponível tem `a/b/share/low/high=null`. Zero oficial é preservado como zero. Tipos exatos em `src/core/types.ts`; invariantes em `src/core/validation.ts`.

Modelo atual: `transfer-logit-v2-coherent`. `health.electorateDifferences` informa unidades observadas cujo eleitorado atual difere da referência histórica. A diferença não invalida votos internamente consistentes nem substitui a base congelada. Universo histórico sem correspondência permanece fora do modelo.

## Leitura pública

| GET | Retorno |
|---|---|
| `/api/latest` | Último snapshot publicado inteiro; 503 antes da primeira publicação |
| `/api/history?before=N` | Até 120 snapshots, em ordem; `before` exclusivo localmente e na nuvem; interface carrega páginas anteriores e conserva o histórico recebido |
| `/api/health` | Estado, horários e heartbeat, independentes de mudança dos votos |
| `/api/territories` | UFs + exterior do último snapshot |
| `/api/municipalities?uf=AC&sequence=N` | Municípios da versão publicada, sem misturar com outra versão |

Percentuais são frações 0–1; contagens oficiais inteiras; projeções podem ser fracionárias. O histórico municipal 1T usa todos os votos válidos, incluindo outros candidatos. Códigos TSE são strings com zeros preservados; código IBGE é campo próprio vindo de EA12.

## Escrita privada (Worker)

Requer `Authorization: Bearer <INGEST_TOKEN>`, HTTPS no coletor e corpo até 90.000 bytes. O segredo não existe no frontend.

| Método/caminho | Corpo ou consulta |
|---|---|
| POST `/ingest/lease` | `{shard,owner}` → `{shard,owner,epoch,expires}`; colisão 409 |
| POST `/ingest/batch` | `{lease,id,payload:{baseHash,records,cursor,queue}}`; imutável por `(shard,id)` |
| GET `/ingest/batches?shard=g0&after=C` | Página de 100 lotes; `cursor` inteiro serial, exclusivo; avançar somente após aplicar/persistir |
| POST `/ingest/territories` | `{lease,sequence,uf,page,territories}`; só coordenador, até 100 municípios por página |
| POST `/ingest/snapshot` | `{lease,snapshot}`; só coordenador, conteúdo validado, sequência crescente, páginas municipais completas antes de publicar |
| POST `/ingest/heartbeat` | `{lease,message,queue}`; verificação recente sem novo resultado |

Extensões de operação: `GET /ingest/sequence` retorna a maior sequência publicada/reservada para pular uma publicação incompleta após queda; `GET /ingest/health` lista heartbeats dos grupos. `shard=all` em `/ingest/batches` permite ao coordenador ler todos os grupos num fluxo serial. Bateladas de produção usam `payload:{encoding:"gzip-base64",data}`; a expansão acontece no coletor.

`/ingest/territories` com `contentAddressed:true` retorna `{hash}` e armazena somente um blob comprimido por conteúdo. O manifesto `municipalityPages:[{uf,pages,hashes}]` do snapshot referencia esses blobs, conferidos antes da publicação. `GET /api/municipalities?...&compressed=1` retorna `{encoding:"gzip-base64-pages",pages:[...]}` para expansão no navegador; sem esse parâmetro, retorna o array expandido. Não há linhas de referência por página/versão no caminho de produção. O heartbeat pode carregar o EA20 nacional mais recente; ele só é usado fora do replay.

Snapshot repetido com hash igual é idempotente; identidade repetida com conteúdo diferente é conflito 409. Lease vencida ou de epoch anterior não escreve. A troca de ponteiro `latest` é atômica com a inserção do snapshot. Dados municipais só são lidos para sequências já publicadas. O schema usa índice `(shard,serial)` para leitura incremental dos lotes.

## BUs e versões

`Observation.status`: `received`, `totalized` ou `excluded`. Apenas `totalized` contribui para o motor. `version` deriva do horário de geração do EA18, não da ordem de chegada HTTP. Hash identifica a versão referenciada no auxiliar, não é declarado SHA do arquivo BU. Conflitos na mesma versão retiram a seção do universo observado até uma versão posterior inequívoca. Correções substituem; exclusões retiram; payload malformado não vira voto zero.

No fallback municipal, `estimated:true` identifica uma alocação do parcial oficial entre seções, e `sourceTime` mantém o relógio do parcial assinado. A versão derivada pode avançar quando um BU real altera a alocação residual sem modificar esse relógio. BUs reais sempre prevalecem sobre estimativas, independentemente de seus números de versão. A observação estimada não comprova a leitura do BU. `health.estimatedSections` contabiliza essas observações no snapshot.

Atualizações municipais são divididas em lotes duráveis de até 1.024 registros e subdivididas por tamanho, limitando o payload comprimido final a 88.000 bytes e reservando espaço para o envelope autenticado de até 90.000 bytes. Cada payload expandido inclui `reconciliation:{id,part,parts,hash}`: identificador da atualização lógica, índice a partir de zero, quantidade de fragmentos e SHA-256 da lista completa de registros em ordem. A atualização abrange as observações e retiradas do ciclo do grupo; fragmentos de grupos diferentes não se misturam.

Todos os fragmentos são preparados e persistidos juntos na outbox antes do primeiro envio. Cada lote mantém sua identidade idempotente até confirmação. O receptor conserva os votos anteriores até completar e conferir o hash da atualização; fragmentos pendentes e atualizações concluídas recentes são persistidos no mesmo checkpoint dos cursores e do ledger. Reinício e confirmação perdida não autorizam aplicar um prefixo. O grupo também reaplica entregas completas recuperadas da própria outbox para reconstruir seu ledger local. Payloads legados continuam legíveis.

A recuperação aceita `limit=1..100` em `/ingest/batches` (padrão legado: 100); o coletor solicita dez lotes por página. O Worker continua armazenando o payload opaco. **Ativação:** API compatível, depois coordenador com a barreira de reconciliação e, por fim, grupos produtores novos. Um coordenador antigo não deve consumir fragmentos municipais novos; todos os jobs devem usar a revisão corrigida antes de ativar o modo municipal.

Um parcial incompatível por horário, quantidade ou capacidade permanece na fila, com estado degradado e retentativa com atraso exponencial limitado a 60 segundos. Estimativas incompatíveis são retiradas; qualquer BU real novo invalida imediatamente o residual anterior de seu município, mesmo se a fila exceder o orçamento de 200 municípios por passagem. A rotação impede que falhas no começo da fila bloqueiem municípios posteriores.
