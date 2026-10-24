# Análise das fontes de projeção — 24/10/2026

Escopo: `docs/fontes/` (readme-apuracao, Metodologia da Simulação, gabrielmassimini, elections-main, eleicao-em-numeros-main), projecao.2026elections.workers.dev, reportagem do NeoFeed e os repositórios oxeeraassim/apuracao, igorofranco/apuracao-2026, diegoivo/segundo-turno-2026, GabrielMassimini/eleicoes-2026, Franzisquin/Simulador-Parlamentar-Brasileiro e eleicaobr.netlify.app/analytics.

## 1. Achado principal: dado de entrada durante a noite

Todos os projetos que operaram ao vivo usam **resultado municipal + andamento**, não boletins por seção:

| Projeto | Entrada ao vivo | Evidência |
|---|---|---|
| Mahlmeister (readme-apuracao, projecao.2026elections) | andamento por UF e município, resultado por município, configuração de seções (o horário identifica seções totalizadas); divergências reconciliadas proporcionalmente | "Durante a noite o TSE não divulga o voto de cada seção, só o total de cada município" |
| eleicao-em-numeros (Hartmann) | índice de andamento por UF; baixa só municípios que mudaram | metodologia, seção 5 |
| oxeeraassim/apuracao | 27 arquivos de resultado + 27 de andamento (`-ab.json`, eleitorado totalizado por município) a cada 30 s | `programa/andamento.py`, `tse.js` |
| igorofranco/apuracao-2026 | resultados por UF e varredura municipal | "BU por seção" listado como pendente |
| GabrielMassimini/eleicoes-2026 | `-ab.json` + municipais com ETag, 5 s | sem projeção estatística |

O Vértice projeta a partir de **BUs por seção** (EA16 → auxiliar → BU). Não foi possível confirmar se esses arquivos são publicados durante a apuração: as páginas do TSE responderam 403. O inventário do 1º turno tem horários reescritos em lote por UF (AC 21h08 de 04/10; SP ~23h; BA 00h52; várias UFs só em 05/10 12h53, PI 14/10, RO 16/10), o que é compatível com publicação tardia, mas não prova a ordem de disponibilidade. Os BUs desses mesmos arquivos foram recebidos entre 17h20 e 19h.

**Risco:** se os BUs por seção só aparecerem horas depois, o ledger do Vértice fica vazio entre 17h e 21h e a projeção permanece indisponível justamente no período de maior interesse. O placar oficial (EA20) não é afetado.

Dados disponíveis ao vivo e não aproveitados hoje:
- `{uf}-e006258-ab.json` (já baixado pelos grupos, conteúdo ignorado): por município, `ts`/`st` (seções), `te`/`est` (eleitorado total e totalizado), `c` (comparecimento), `dt`/`ht`, `and`.
- `{uf}{município}-c0001-e006258-u.json`: votos parciais do município (13, 22, brancos, nulos, válidos), assinados.
- `arquivo-urna/3221/config/{uf}/{uf}-p003221-cs.json`: horário por seção; segundo Mahlmeister, identifica as seções já totalizadas.

## 2. Métodos comparados

| Aspecto | Vértice | Mahlmeister | eleicao-em-numeros | oxeeraassim |
|---|---|---|---|---|
| Unidade | seção (BU) | seção/local, via municipal + configuração de seções | município | município |
| Referência | 1º turno 2026 por seção | 1T 2026 por seção e 2T 2022 por local pareado (93% exato) | 1T 2026 + migração por inferência ecológica (2014/2018/2022) | 1T 2026 por município |
| Início da noite | transferência regularizada (prior 0,5, força 2.000) | transferência por UF capital/interior e por município, até 5% | esperado por migração | esperado composicional |
| Depois | swing logit hierárquico Brasil→região→UF→município, mistura 5–15% | regressão do swing sobre perfil e porte, empírico-bayesiana, mistura 5–15% por município | desvio logit hierárquico bayesiano, Huber, peso pela fração apurada | swing logit com encolhimento (K_UF 180 mil, K_região 90 mil votos), regressão de perfil |
| Âncora inicial | nenhuma | pesquisas, peso decrescente | migração histórica | pesquisas (K_PRIOR 1,5 milhão de votos) |
| Viés de ordem dentro do município | resolvido por seção, se houver BU | 1T da própria seção para o que falta | choque extra ∝ √(fração restante) | não modelado |
| Incerteza | 400 réplicas, perturbação 0,20 logit, sem calibração | bootstrap de municípios + calibração conformal | 2.000 sorteios, choques 0,045/0,05 calibrados em 2022 | bootstrap, 90,7% de cobertura em 300 eleições simuladas |
| Validação | holdout 2022: 0,47 pp a 1%, 0,11 pp a 20%; faixa 15–17 pp | 2022: 0,01 pp após 2%; 1T 2026 ao vivo: 0,2 pp entre 2% e 10% | 2022: dentro da faixa de 90% em 12 de 14 atualizações | 2006–2022: 0,07–1,10 pp com 5% |

O ponto central do Vértice é competitivo (erro de 0,11–0,47 pp em 2022, comparável aos melhores). As fraquezas são: (a) a dependência de BU por seção; (b) a faixa nominal, 5 a 10 vezes mais larga que a dos métodos calibrados.

## 3. Recomendações

**P0 — Modo municipal (disponibilidade).** Os grupos passam a ler o conteúdo do `-ab.json` das suas UFs e o EA20 de cada município que avançou (com ETag, só os que mudaram). Para o município *m* com `st` seções totalizadas, gera-se uma observação **estimada** para as seções totalizadas: o conjunto indicado pelo horário da configuração de seções; na falta dele, as primeiras `st` seções pela ordem de recebimento do 1º turno de 2026 (`DT_BU_RECEBIDO`). O parcial municipal é distribuído entre elas na proporção do esperado de cada seção, com arredondamento que preserva a soma exata e o limite de eleitorado. Essas observações seguem pelo pipeline existente (outbox, lotes, ledger, modelo hierárquico, publicação). Um BU real sempre substitui a estimada; uma estimada nunca substitui um BU real. Validação: replay de 2022 agregando por município nos checkpoints e escolhendo seções pela ordem do 1º turno de 2022 (diferente da ordem real do 2T).

**P1 — Calibração da faixa (precisão comunicada).** Varredura da perturbação inicial (hoje 0,20 logit) e da escala dos resíduos no holdout nacional de 2022, escolhendo o menor valor com cobertura empírica de 95% nos checkpoints. Uma eleição só: registrar como calibração provisória e manter o vencedor estatístico desabilitado.

**P2 — Eficiência.** Requisições condicionais com ETag (304) para `-ab.json`, EA20 e configuração de seções. Baixar apenas os municípios cujo `st` mudou.

**Não recomendado antes de 25/10:** segunda referência (2T 2022 por local pareado), âncora de pesquisas e matriz de inferência ecológica. Os três exigem preparação de dados e validação que não cabem até o congelamento.

## 4. Fontes sem conteúdo aproveitável

- **diegoivo/segundo-turno-2026:** o README não foi carregado (só a estrutura de pastas: collector, model, backfill/1t2026).
- **Franzisquin/Simulador-Parlamentar-Brasileiro:** simulador legislativo, sem relação com a projeção presidencial.
- **eleicaobr.netlify.app/analytics:** página renderizada por JavaScript, sem conteúdo acessível na leitura.
- **Notícias do TSE sobre a disponibilidade dos arquivos de urna:** responderam 403.
