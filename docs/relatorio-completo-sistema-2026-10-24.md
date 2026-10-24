# Vértice — relatório completo do sistema

> **ATUALIZAÇÃO FINAL — INTERRUPÇÃO SOLICITADA:** em **24/10/2026 às 12h42min24s de Brasília**, os três processos locais de ensaio foram encerrados a pedido do usuário. Foi conferida a ausência de processos remanescentes desses scripts. A coleta de produção no GitHub Actions não foi cancelada. As referências a trabalhos “em andamento” no corpo abaixo descrevem o checkpoint anterior; o estado final e a retomada estão na seção 18.

> **ATUALIZAÇÃO 24/10, TARDE:** pendências retomadas e concluídas conforme a seção 19 (publicação concorrente, resiliência, teste real ponta a ponta, pico nacional isolado e holdout nacional de 2022).

**Data de referência:** 24/10/2026. Última consulta à saúde da produção neste relatório: **12h39min45s de Brasília**, correspondente a `2026-10-24T15:39:45.057Z`.

**Natureza:** relatório técnico e operacional, elaborado com leitura do código, configurações, documentação e logs. Os ensaios de pico e a avaliação histórica nacional permaneciam em execução durante sua elaboração. Resultados parciais não representam aprovação final.

## 1. Resumo executivo

O Vértice está publicado e acessível em **https://apuracao-presidente-2026.phdtemiranda.workers.dev/**. O código publicado está no repositório público **https://github.com/magisph/apuracao-presidente-2026**.

O produto é um painel de acompanhamento da eleição presidencial brasileira de segundo turno de 25/10/2026, destinado ao uso pessoal em computador. Combina três camadas explicitamente distintas: resultado oficial agregado do TSE; boletins de urna efetivamente coletados; projeção experimental do resultado final.

A coleta remota opera no GitHub Actions. O painel e a API estão em um Cloudflare Worker, com persistência no D1. O funcionamento dos runners remotos, a persistência, a retomada de leases e o encadeamento foram demonstrados. Isso não equivale a uma garantia de disponibilidade contínua do GitHub Actions.

A última consulta à produção retornou **estado `ok`, fila zero e `collectionState=ok`**. A revisão publicada é `771ebdd99b480aecec8fff09ab1373c960635c48`. O CI dessa revisão passou. Na sessão atual, a suíte voltou a passar: **59 testes, zero falhas**; o typecheck também passou, incluindo os novos scripts de ensaio.

**Pendências centrais:** concluir o ensaio nacional de ingestão e recuperação na Cloudflare; corrigir e verificar o gargalo de publicação sequencial identificado; concluir a avaliação histórica nacional. A precisão nacional e a cobertura estatística de 95% ainda não estão comprovadas. O anúncio de vencedor estatístico permanece desabilitado.

## 2. Escopo e fronteiras

### Incluído

- Presidência da República, segundo turno, identidade de eleição `6258`, cargo `0001`, candidatos configurados `13` e `22`.
- Consulta oficial nacional e por UF, incluindo exterior.
- Coleta independente de BUs, controle de versões, correções, exclusões e quarentena de conflitos.
- Base histórica do primeiro turno, com correspondência explícita de seções principais e agregadas.
- Projeções nacional, estadual e municipal calculadas de forma coerente.
- Histórico de snapshots e reprodução temporal na interface.
- Diagnóstico de saúde, filas, horários e cobertura da coleta.
- Execução remota temporária, com orçamento de serviços gratuitos como restrição de projeto.

### Fora do escopo ou não implementado

- Experiência específica para celulares; o foco é desktop.
- Sistema oficial de totalização ou homologação de resultado eleitoral.
- Probabilidade numérica de vitória e selo de vencedor estatístico calibrado.
- Apuração oficial municipal EA20 integrada ao mapa: a camada municipal atual oferece projeção e comparação histórica; a apuração oficial geográfica permanece por UF.
- Garantia de disponibilidade contratual ou de precisão futura.
- Teste de desligamento físico do computador: **dispensado expressamente pelo usuário**, não é pendência desta rodada.

## 3. Arquitetura implementada

| Componente | Implementação e responsabilidade |
|---|---|
| Interface | TypeScript, HTML/CSS e Vite; renderização do painel e consumo da API. |
| Coleta | Node.js/TypeScript, com coordenador e cinco grupos de UFs. |
| Execução remota | GitHub Actions, runners Ubuntu com Node 24, workflow `collect.yml`. |
| API e hospedagem | Cloudflare Worker com Workers Static Assets, frontend e API na mesma origem. |
| Persistência | Cloudflare D1: leases, lotes, snapshots, ponteiro do último snapshot, conteúdo municipal e heartbeats. |
| Base congelada | Arquivo gzip em uma Release do GitHub, com conferência do SHA-256 após descompressão. |
| Operação local | Servidor e ferramentas locais para coleta, diagnóstico, replay e ensaios. |

O coordenador reúne lotes dos cinco grupos, mantém o ledger nacional, consulta os resultados oficiais, calcula a hierarquia de projeções e publica municípios e snapshot. Os grupos são distribuídos por quantidade de seções principais; não há uma divisão fixa arbitrária de cinco listas de estados.

Os contratos e invariantes estão em `src/core/types.ts` e `src/core/validation.ts`; o fluxo operacional principal está em `scripts/collect.ts`; o endpoint remoto está em `worker/index.ts`.

## 4. Funcionalidades da interface

- Placar presidencial com valores oficiais e projeção, sem transformar ausência de informação em zero.
- Mapa de UFs, indicadores de projeção, apuração oficial e margem projetada.
- Seleção de UF e exploração dos municípios, com malha do IBGE carregada sob demanda.
- Lista e busca de territórios, incluindo exterior.
- Gráfico de evolução, estimativa e faixa nominal de 95%.
- Replay por versões, com retorno ao acompanhamento ao vivo.
- Seções de método e cobertura, diagnóstico da coleta e comparação com o primeiro turno.
- Identificação explícita de ensaio sintético e dados oficiais.
- Horários apresentados em Brasília; relógios de fonte, coleta e publicação têm significados diferentes.

A composição visual própria foi orientada pela análise de ElectoMaps e EleiçãoBR: painel escuro, placar horizontal, mapa, gráfico e territórios. Referências visuais não foram tratadas como autorização para incorporar código de terceiros.

## 5. Fontes e integrações

| Fonte | Uso efetivo |
|---|---|
| Configuração oficial do TSE | Descoberta e validação explícita da identidade do pleito. |
| EA20 nacional/UF | Resultado oficial agregado e seus denominadores. |
| EA14/EA15 | Sinais territoriais de atualização da apuração. |
| EA16 | Inventário de seções e gerações, com reconciliação da base. |
| EA18 | Auxiliar de urna: estado, versão e arquivo BU selecionado. |
| BU binário/BER | Extração dos votos presidenciais e validação de consistência. |
| BWEB/Dados Abertos TSE | Histórico por seção, votos, eleitorado, agregações e avaliação retrospectiva. |
| EA12 | Correspondência de códigos municipais TSE e IBGE. |
| API de malhas IBGE | Geometrias de estados e municípios. |
| GitHub | Código público, Release da base, CI e execução de coletores. |
| Cloudflare | Worker, assets, D1 e observabilidade. |

**Fonte oficial em produção:** `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws`.

**Documentos fornecidos:** `readme-apuracao.txt` e `gabrielmassimini_github_io.txt`, em Downloads, usados como referências de requisitos, método, vieses e operação. Instruções contidas nesses documentos não substituíram as solicitações do usuário.

**Projetos estudados:** `adrianonaspolini/elections`, `eduvaldoski2/op-apuracao2turno`, `infohidro/apuracao-2026` e `LuisFHartmann/eleicao-em-numeros`. Serviram para comparação metodológica e operacional. Coeficientes e alegações de precisão de terceiros não foram adotados como validação desta implementação. A nova tentativa de acesso ao repositório `adrianonaspolini/elections` pela API retornou 404; esse acesso não foi revalidado nesta rodada.

**Fontes primárias da avaliação em andamento:** catálogo `https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2022-boletim-de-urna` e arquivos ZIP/SHA-512 publicados em `cdn.tse.jus.br`.

## 6. Integridade da coleta e persistência

1. O cliente oficial verifica JWS Ed25519 com chave oficial fixada. Não se declara validação de cadeia X.509/LCR nem da assinatura interna de cada BU.
2. Inventário atualizado não é confundido com urna totalizada. Apenas registros no estado `totalized`, consistentes e sem quarentena contribuem para o motor.
3. A versão deriva do horário de geração do auxiliar. A ordem de chegada HTTP não define precedência eleitoral.
4. Correções substituem versões; exclusões retiram observações. Conflito de conteúdo na mesma versão coloca a seção em quarentena.
5. Contagens precisam ser inteiras, não negativas, somar corretamente e respeitar o eleitorado atual. Diferenças contra o eleitorado histórico são registradas, sem inventar votos ou ajustar o BU ao agregado oficial.
6. A outbox local preserva identidade e bytes do lote até confirmação; repetição após resposta perdida é idempotente.
7. Leases com proprietário, época e vencimento impedem gravações por um processo antigo após troca de titularidade.
8. O snapshot só se torna público depois de existirem todas as páginas municipais exigidas. A inserção e a atualização de `latest` são atômicas.
9. Blobs municipais são comprimidos e endereçados por hash; conteúdos iguais podem ser reutilizados.
10. Segredo de ingestão é privado no Worker e no GitHub. Não está no frontend. Este relatório não contém valores de credenciais.

## 7. Base histórica e universo

- **499.248** unidades no inventário operacional.
- **499.206** correspondências históricas.
- **42** unidades sem histórico e sem eleitorado individual conhecido na base; ficam fora da projeção modelada.
- Eleitorado histórico conhecido: **158.745.007**.
- Eleitorado oficial usado na reconciliação: **158.745.502**.
- A diferença não recebe uma causa presumida.
- SHA-256 da base JSON descomprimida: `2d2f46c70fff94782d60e8ee6b66e39b83b457ade6010414c345e9a2b15d61ff`.
- Release: `https://github.com/magisph/apuracao-presidente-2026/releases/tag/base-20261024-2d2f46c70fff`.

Cobertura do eleitorado de referência, progresso dos BUs coletados e percentual oficial de seções totalizadas são indicadores diferentes. A interface e o motor não devem tratá-los como equivalentes.

## 8. Método de projeção implementado

**Versão:** `transfer-logit-v2-coherent`.

### Transferência de votos

Estima a transferência dos votos de outros candidatos do primeiro turno para os dois finalistas. O ajuste considera o perfil anterior e utiliza regularização, com prior inicial de transferência 0,5 e força 2.000. Há estimativas nacionais e por estrato de UF/capital/interior; exterior é tratado separadamente.

### Swing em escala logit

Compara o perfil histórico da seção com os votos efetivamente observados no segundo turno. O deslocamento é regularizado na hierarquia Brasil → região → UF → município. Territórios com poucos BUs recebem informação dos níveis superiores.

### Mistura e participação

A mistura é determinada pelo progresso ponderado por eleitorado: o peso do swing cresce de zero a um entre aproximadamente 5% e 15% observado. A quantidade de votos válidos restantes considera participação histórica e a razão observada entre turnos, regularizada e limitada ao eleitorado.

### Coerência geográfica

O ajuste ocorre uma vez nacionalmente. Previsões por unidade são agregadas para Brasil, UF e município. Os mesmos sorteios alimentam a distribuição territorial; estimativas pontuais são somáveis, quantis não.

### Incerteza

São usadas 400 réplicas por padrão, com resíduos agrupados por município e componentes correlacionados nacional/UF. Os quantis 2,5% e 97,5% formam uma **faixa nominal**, com perturbações iniciais de 0,20 em logit. Esses parâmetros não têm calibração nacional independente comprovada.

Quando todo o universo modelado está observado, a estimativa coincide com a soma desses votos. Isso é uma propriedade contábil, não prova de precisão antecipada.

### Vencedor

O vencedor estatístico permanece `null`; não há probabilidade numérica de vitória. Existe uma regra matemática separada: a vantagem oficial deve superar todo o eleitorado restante conhecido e validado. Essa regra não utiliza o intervalo experimental como prova de vitória.

## 9. Operação remota e significado do encerramento

Workflow: `https://github.com/magisph/apuracao-presidente-2026/actions/runs/40106976330`. A última consulta desta rodada indicou execução em andamento.

- Seis processos: coordenador + `g0` a `g4`.
- Ciclos configurados para 345 minutos, com continuação automática habilitada.
- Prazo absoluto: **26/10/2026, 9h de Brasília**, equivalente a `2026-10-26T12:00:00Z`.
- Esse prazo encerra **novas consultas de coleta e o encadeamento de novos ciclos**. Não apaga o banco, o histórico, o repositório ou o painel publicado.
- O processo usa o menor prazo entre sua duração e o limite absoluto; HTTP em andamento também recebe cancelamento no prazo.
- Alterar apenas `CHAIN_ENABLED=false` não impede necessariamente a continuação de uma execução que já tenha capturado `true`. Para parada imediata, a orientação registrada é desabilitar o workflow e cancelar execuções ativas.
- Cadências configuradas: publicação nominal de 90 s, consulta/heartbeat nacional de 15 s, heartbeat de grupos de 60 s. São configurações, não garantia de latência observada.
- Limites de consulta: grupos até 15 requisições/s; coordenador até 5. Há retry/backoff, tratamento de 429, circuito para 403 e cooldown para 404.

O encadeamento usa `GITHUB_TOKEN` efêmero, com `actions:write` no job específico de continuação. Não depende de token pessoal permanente. Filas do GitHub e retomada de leases podem introduzir lacunas.

## 10. API disponível

Leitura pública: `/api/latest`, `/api/history?before=N`, `/api/health`, `/api/territories` e `/api/municipalities?uf=AC&sequence=N`. Histórico paginado em até 120 versões; municípios são vinculados à versão publicada. A opção `compressed=1` permite expansão das páginas no cliente.

Escrita privada: `/ingest/lease`, `/ingest/batch`, `/ingest/territories`, `/ingest/snapshot` e `/ingest/heartbeat`; recuperação em `/ingest/batches`, `/ingest/sequence` e `/ingest/health`. Requer autenticação e corpos de até 90.000 bytes. Lotes de produção são comprimidos como gzip/base64.

## 11. Verificações concluídas

| Verificação | Evidência e alcance |
|---|---|
| Suíte atual | 59 testes passaram nesta rodada, zero falhas; `data/tests-peak.log`. |
| Typecheck | Passou nesta rodada, incluindo scripts novos. |
| Build/CI publicado | CI da revisão publicada concluído com sucesso: execução `40106972596`. |
| Ingestão real | Sem credencial: 401. Lote administrativo sem votos: criação 201, repetição 200, conflito 409, época antiga 409. |
| Publicação incompleta | Rejeitada com 409, preservando o snapshot público anterior. |
| Recuperação remota | Novos proprietários e épocas dos seis coletores confirmados no D1. |
| Aba fechada | Heartbeats avançaram e snapshot passou de `live-4` para `live-5` com a aba fechada. |
| Navegador | Painel público e exploração Acre → Porto Walter conferidos. |
| Base | 28 derivados por UF verificados; manifesto anterior conferiu 95 hashes. Novos scripts desta rodada ainda não integram esse manifesto publicado. |
| Holdout Acre/2022 | 2.124 unidades aceitas, zero rejeitadas, 210 diferenças de eleitorado registradas; total final exato. |

No holdout do Acre, o erro no primeiro checkpoint foi aproximadamente 3,577 pontos percentuais; em torno de 20,59% observado, 0,351 pp; em torno de 51,27%, 0,397 pp. Isso descreve aquele ensaio e não autoriza generalização nacional.

## 12. Ensaio de pico em andamento

Foi criado ambiente isolado com **o mesmo código do Worker**, sem assets de painel:

- Worker: `apuracao-presidente-2026-peak-20261024`.
- URL: `https://apuracao-presidente-2026-peak-20261024.phdtemiranda.workers.dev`.
- D1: `apuracao-presidente-2026-peak-20261024`.
- A implementação do ensaio restringe a URL de escrita ao Worker isolado. **Nenhum voto sintético deste ensaio foi enviado ao Worker de produção.**

### Resultados locais parciais já registrados

| Fração observada | Observações | Cálculo hierárquico |
|---|---:|---:|
| 1% | 4.992 | 14,28 s |
| 10% | 49.924 | 12,79 s |
| 50% | 249.624 | 12,28 s |
| 100% | 499.248 | 4,71 s |

Cada ponto incluiu 28 agregados de UF/exterior e 5.757 municípios. A diferença absoluta de soma das UFs contra o nacional foi inferior a 0,000001 voto; no ponto final foi zero.

### Resultados remotos parciais já registrados

- Publicação a 1%: cálculo de 15,49 s; publicação e conferência remotas de 38,08 s; maior corpo municipal medido de 60.591 bytes.
- Publicação a 10%: cálculo de 22,99 s; publicação e conferência remotas de 89,65 s; maior corpo municipal de 62.310 bytes.
- Amostra inicial de Analytics do Worker de ensaio: 84 requisições, zero erros; CPU P50 de 3,776 ms e P99 de 13,053 ms. É uma amostra parcial; não significa carga aprovada nem garante que nenhuma requisição futura excederá limites.

**Gargalo identificado:** as 71 páginas municipais são enviadas sequencialmente. O ensaio mediu uma publicação próxima de 90 s só no transporte/conferência, além do cálculo. A correção proposta é concorrência limitada a quatro páginas, preservando hashes, leases e publicação atômica. **Essa correção ainda não foi implementada nem publicada no momento deste relatório.**

O roteiro de ensaio também executa decodificação BER repetida na dimensão do universo, envio concorrente dos lotes, recuperação para um ledger novo, conferência dos totais, leituras concorrentes e correções/exclusões. **Essas etapas finais ainda não tinham resultado concluído na consulta usada para este relatório.** O ensaio não faz carga massiva nos servidores do TSE.

Arquivos: `scripts/peak.ts`, `data/peak-local.log`, `data/peak-remote.log` e `data/peak-report.json`. O JSON é um checkpoint mutável; durante execuções simultâneas, consultar também os logs para distinguir local e remoto.

## 13. Avaliação histórica nacional em andamento

Novo executor: `scripts/holdout-national.ts`.

O procedimento descobre os recursos no catálogo oficial, confere o SHA-512 de cada arquivo baixado, extrai os dois turnos de 2022 por UF, reconstrói correspondências, ordena os registros pelo recebimento final e aplica o mesmo ledger e modelo operacional. Não altera parâmetros após olhar os resultados.

Na última consulta, os dois turnos de **AC, AL, AP, AM, BA, CE e DF** já estavam processados. As demais UFs ainda estavam pendentes. Não havia relatório nacional final.

Arquivos: `data/holdout-national.log`, `data/holdout-national-2022/progress.json`, catálogo e arquivos intermediários no mesmo diretório. O resultado final previsto é `data/holdout-national-2022/report.json`.

Limitações metodológicas que esse download não elimina: arquivos finais ordenados por recebimento não recuperam todas as versões substituídas, exclusões e latências de disponibilidade; uma única eleição nacional não demonstra cobertura de 95% entre eleições; códigos de capital usados como referência geográfica precisam de auditoria histórica. Por isso o script mantém `calibrationSufficient=false`.

## 14. Custos, quotas e continuidade

Não foi contratado novo plano pago nesta etapa. As quotas gratuitas são compartilhadas com os demais recursos da conta. A existência de outro projeto na conta não autoriza utilizá-lo ou alterá-lo.

A estimativa anterior, para seis horas de mudanças, publicações a cada 90 s e todas as páginas mudando, foi de aproximadamente 273 MB, 71.223 linhas escritas e 74.461 requisições/dia. **É planejamento, não resultado de ensaio nacional.** Retries, índices, público, alterações adicionais e duração maior podem modificar o consumo.

A documentação consultada nesta rodada informa que o D1 Free aplica limites diários de 5 milhões de linhas lidas e 100 mil escritas; ao excedê-los, consultas podem falhar até o reset de 00h UTC. O ensaio precisa ser concluído com análise de consumo real e margem residual. Nenhuma contratação ou expansão paga está autorizada por este relatório.

## 15. Pendências priorizadas

| Prioridade | Pendência | Critério de conclusão |
|---|---|---|
| Alta | Concluir pico remoto nacional | Todos os lotes persistidos e recuperados, totais iguais, métricas de erros/latência/CPU e consumo registradas. |
| Alta | Corrigir envio sequencial municipal | Teste de regressão, concorrência limitada, ordem de hashes preservada, ensaio remoto repetido e avaliação da cadência completa. |
| Alta | Concluir holdout nacional 2022 | Todas as UFs/exterior, hashes, rejeições, cobertura, erro por checkpoint e reconciliação final registrados. |
| Alta | Calibração estatística independente | Replay temporal real e validação entre eleições; não habilitar selo apenas porque um replay final ou sintético passou. |
| Média | Reavaliar orçamento com medidas reais | Margem de quotas compartilhadas, amplificação de índices/retries e duração da eleição. |
| Média | Atualizar documentos históricos | `docs/sistema.md` ainda usa “nuvem preparada”; `docs/revisao-corrigida.md` registra o estágio anterior à publicação. Este relatório e `docs/nuvem.md` distinguem esse histórico do estado atual. |
| Média | Consolidar evidências e publicar a rodada | Revisar diff, atualizar manifesto, executar build/suíte e publicar somente ajustes verificados. |

## 16. Estado dos trabalhos e retomada

No momento da consulta, permaneciam ativos os processos locais do holdout nacional e de dois ensaios de pico. Eles **não foram cancelados para produzir este relatório**. Os coletores de produção continuam em runners do GitHub; esses processos locais são de ensaio.

O encerramento deste atendimento ou a falta de créditos não equivale a conclusão dos ensaios. Ao retomar, conferir os logs e os processos antes de iniciar qualquer repetição, evitando duplicar carga. O script remoto exige banco de ensaio sem snapshots anteriores; não deve ser reiniciado apontando para produção nem receber uma limpeza indiscriminada para passar nessa condição.

Mudanças locais desta rodada ainda não publicadas: os scripts `scripts/peak.ts`, `scripts/holdout-national.ts`, o plano `docs/progresso-pico.md` e este relatório. Nenhuma mudança no algoritmo de projeção ou no fluxo produtivo foi publicada nesta rodada até esta consulta.

## 17. Referências internas e externas

- Código: `scripts/collect.ts`, `worker/index.ts`, `worker/schema.sql`, `src/core/model.ts`, `src/core/ledger.ts`, `src/collector/http.ts`, `src/collector/tse.ts`, `src/collector/ber.ts`, `src/ui/main.ts`.
- Documentação: `docs/nuvem.md`, `docs/api.md`, `docs/metodo.md`, `docs/fontes.md`, `docs/validacao.md`, `docs/revisao-corrigida.md` e `docs/evidencias/manifest.json`.
- CI publicado: https://github.com/magisph/apuracao-presidente-2026/actions/runs/40106972596
- Limites D1: https://developers.cloudflare.com/d1/platform/limits/
- Preços e quotas D1: https://developers.cloudflare.com/d1/platform/pricing/
- Aplicação dos limites gratuitos: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Limites Workers: https://developers.cloudflare.com/workers/platform/limits/

**Estado de entrega:** sistema publicado e coleta remota operacional na última verificação; ensaios ampliados em execução; gargalo municipal identificado e ainda pendente de correção; precisão nacional independente não homologada. Não há fundamento, neste checkpoint, para declarar todos os limites resolvidos.

## 18. Estado final após interrupção e roteiro de retomada

**Interrupção efetivada:** 24/10/2026, `2026-10-24T15:42:24.6033637Z` (12h42 de Brasília), por solicitação expressa do usuário para preservar créditos. Foram encerrados somente os processos locais dos scripts `peak.ts` (dois processos) e `holdout-national.ts` (um processo). Contagem conferida após o encerramento: **zero processos remanescentes desses ensaios**. Coletores remotos produtivos, servidores locais preexistentes, banco e dados preservados.

### Trabalho concluído e preservado

- Projeção hierárquica local nos quatro checkpoints, inclusive 499.248 observações; resultados na seção 12.
- Publicações remotas nos quatro checkpoints, agora incluindo **50% e 100%**: em 50%, cálculo de 12,96 s e publicação/conferência de 37,65 s; em 100%, cálculo de 5,14 s e publicação/conferência de 35,91 s. Todos com 5.757 municípios, 28 agregados e soma territorial conferida. Maior corpo municipal nesses pontos: 59.998 e 58.619 bytes, respectivamente.
- Os quatro snapshots e conteúdos municipais de ensaio foram publicados **somente no Worker/D1 isolado**. A execução foi interrompida durante a etapa posterior de decodificação repetida; não há comprovação de conclusão das etapas nacionais de lotes, recuperação e leitores concorrentes.
- Avaliação histórica: os **18 arquivos dos dois turnos de nove UFs** — AC, AL, AP, AM, BA, CE, DF, ES e GO — foram processados, com **105.770 unidades históricas de referência** acumuladas. ZIPs, caches `json.gz`, catálogo, SHA-512 de origem e progresso estão preservados. Demais UFs e avaliação nacional final pendentes.
- 59 testes e typecheck aprovados nesta rodada. Novos scripts e relatório preservados localmente, ainda sem commit/push nesta rodada.
- Gargalo de publicação sequencial documentado; nenhuma implementação de paralelismo foi realizada antes da interrupção.

### Arquivos para não repetir trabalho

- `data/checkpoint-interrupcao-20261024.json`: instante de parada, processos encerrados, revisão Git, estado de preservação e hashes dos principais artefatos.
- `data/peak-local.log` e `data/peak-remote.log`: medidas efetivamente concluídas, separadas por ambiente.
- `data/peak-report.json`: checkpoint parcial; não tratar como relatório de execução completa.
- `data/holdout-national-2022/progress.json`: proveniência e unidades concluídas por UF/turno.
- `data/holdout-national-2022/*-*.json.gz` e ZIPs: extrações e arquivos oficiais reutilizáveis pelo script; preservar eventuais arquivos `.part` sem presumir que estejam completos.
- `scripts/peak.ts`, `scripts/holdout-national.ts` e `docs/progresso-pico.md`: código e roteiro da rodada.
- `data/peak-wrangler.toml`: configuração do ambiente isolado. O arquivo de segredo local é privado e deve permanecer fora de compartilhamento e versionamento.

### Retomada recomendada

1. Ler esta seção e o checkpoint; conferir o estado dos processos e da produção sem presumir continuidade baseada neste relatório.
2. Retomar `holdout-national.ts` utilizando os caches existentes. O script reutiliza as extrações cujo SHA-512 de origem corresponde ao catálogo, evitando baixar e analisar novamente os arquivos concluídos. A nova execução ainda pode refazer a montagem em memória a partir desses caches.
3. Não executar novamente o pico remoto do início: seu código exige banco sem snapshots e os quatro snapshots de ensaio já existem. Adaptar a retomada para pular as publicações concluídas e prosseguir com decodificação/lotes/recuperação, ou criar um ensaio novo somente quando necessário. Não apagar o banco nem apontar o script para produção para contornar essa proteção.
4. Corrigir o envio sequencial com regressão e concorrência limitada; repetir apenas a medição afetada, preservando as evidências anteriores para comparação.
5. Concluir medições remotas e avaliação histórica antes de afirmar carga aprovada ou precisão calibrada. Atualizar relatório, manifesto e documentação; revisar/publicar somente as alterações verificadas.

**Estado final válido:** trabalhos locais interrompidos e preservados; produção mantida; pico parcialmente exercitado em escala nacional; correção de publicação e validação estatística ainda pendentes. Desligamento físico continua fora do escopo por decisão do usuário.

## 19. Retomada e conclusão das pendências — 24/10/2026, tarde

Executado conforme plano aprovado pelo usuário, no branch `pendencias-eleicao-2t`. Modelo inalterado (`modelHash` `5ae9c873…02ae3`); vencedor estatístico continua `null`.

### Correções no fluxo produtivo

- **Publicação municipal concorrente** (`src/collector/publication.ts`): até 4 páginas em voo, manifesto na ordem das UFs e hashes por índice de página; na primeira falha, nenhuma página nova é despachada e o snapshot não é enviado. O Worker não mudou: o caminho endereçado por conteúdo já era idempotente.
- **Resiliência** (`src/collector/failure.ts`, `scripts/supervise.ts`): antes, qualquer resposta não 2xx do Worker encerrava o shard até o fim do ciclo (até 6 h). Agora 5xx, 429, 400 `request rejected` (exceção interna do Worker, inclusive D1) e falhas de rede recuam com backoff (até 60 s); 4xx, cercamento de lease e divergência de base continuam fatais. O supervisor reinicia o coletor encerrado com erro, em 30 s, com o tempo restante do ciclo.
- **Transporte compartilhado** (`fetchAuxiliary`/`downloadBU` em `src/collector/tse.ts`), usado pela coleta e pelo teste real; a política de `collectSection` permaneceu igual.

### Evidências

| Verificação | Resultado |
|---|---|
| Teste real ponta a ponta (AC, 1º turno de 2026) | 2.270/2.270 BUs, 0 falhas; votos de 13, 22, brancos, nulos e seções idênticos ao EA20 assinado; 23 nulos técnicos explicados; round trip no Worker isolado íntegro. |
| Pico nacional isolado (retomada a partir dos 4 snapshots) | 499.248 registros, 3.902 lotes, 1.472 registros/s; recuperação 42 s com totais iguais; 800 leituras concorrentes; 100% respostas 2xx. Publicação 11,9 s (10%) e 11,3 s (100%), antes 89,7 s e 35,9 s. Decodificação BER do universo: 290–365 s em um processo. |
| Holdout nacional 2022 | 28 UFs/exterior, 472.028 eventos, 0 rejeições. Erro 0,47 pp a 1%, 0,19 pp a 5%, 0,11 pp a 20%, 0,03 pp a 50%. Faixa nominal cobriu sempre, mas com largura de 15–17 pp até 20%. |
| Orçamento D1 medido | Produção ≈1.100 escritas/h em pré-apuração; publicação ≈134 linhas; lote ≈3,8. Projeção 25/10 UTC: 63–67 mil de 100 mil. Intervalo de 90 s mantido. |

### Achados que permanecem

1. A faixa nominal de 95% é conservadora demais (±7–8 pp no início da apuração). Não foi recalibrada: alterar o modelo na véspera, sem validação entre eleições, aumentaria o risco.
2. Margem de cota D1 de cerca de 33 mil linhas no dia UTC 25/10. Se for excedida, as escritas param até 00:00 UTC (21h de Brasília); os coletores sobrevivem e retomam.
3. A troca natural de ciclo cairia por volta de 17h25 de Brasília em 25/10; o realinhamento planejado para 15h15 de Brasília a evita.

## 20. Modo municipal e faixa provisória preparados — 24/10/2026, noite

Estado atual consolidado em `docs/revisao-municipal-2026-10-24.md`. O branch local `modo-municipal` está preparado; a produção ainda executa `main=d6eaf57`, run `40133213187`, e aguarda confirmação humana para merge/push/ativação.

- Fallback municipal com andamento e EA20 assinados; estimativas explícitas, precedência do BU real, reconciliação de residual, tratamento de inventário indisponível, correções para zero e arquivos defasados.
- Seis grupos importantes da revisão independente receberam correções com regressões RED→GREEN. Lotes limitados por bytes e agrupamento de até 1.024 observações reduzem amplificação de escritas; recuperação em páginas de dez, mantendo o padrão legado da API.
- Ordem de recebimento 1T validada e commitada (`1764255`): 499.206 horários utilizáveis em 499.248 unidades, todas as unidades modeladas cobertas, 42 ausentes fora do modelo. O gerador foi corrigido após detectar o formato ISO nas datas reais de 2026. SHA-256 do gzip: `079bae7eeec2405ed2b8aa41caa325c03901d309d941537cb48d43d65d73cf4a`.
- Varredura de quatro pares nos modos seção e municipal concluída. Menor par aprovado nos 14 checkpoints abaixo de 100%: **nacional 0,03 / UF 0,035**. Faixas aproximadamente de 3,25 pp (seção) e 4,11 pp (municipal) no checkpoint inicial; 0,98 e 1,06 pp no de 50%. O estimador pontual foi preservado; só os choques padrão mudaram nesta retomada. Configuração e resultados em `config/calibracao-faixa-2022.json`.
- **Calibração provisória, não independente:** mesma eleição de 2022 usada para seleção e avaliação; sem prova de cobertura futura de 95%, sem probabilidade ou selo estatístico de vencedor. Checkpoint de 100% preserva as pequenas diferenças do universo histórico e não foi usado para escolher choques.
- **98 testes aprovados, build/TypeScript aprovados, dry-run de publicação aprovado.** Interface conferida em fixture local; todas as superfícies ocultam projeções abaixo de 1%.
- Nenhum dado de teste enviado à produção, nenhum banco apagado e nenhum plano pago contratado. A carga municipal real de 25/10 permanece futura; o orçamento anterior não é homologação desse volume.

Congelamento pedido para 25/10 às 12h de Brasília. Lembrete do realinhamento de run em 25/10 às 15h15 foi criado. Após confirmação: merge/push, CI, API/assets compatíveis antes dos novos coletores e conferência da primeira publicação pelo hash de modelo `f1835080b0161880fda5245692f356b711a7cdb35ed68da5c7a28a0cb6b41cbd`. Até lá, mudanças apenas locais.
