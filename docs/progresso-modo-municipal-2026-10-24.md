# Retomada do modo municipal — 24/10/2026 à noite

Plano autorizado: geração e commit local da ordem 1T; varredura dos quatro pares de choques; menor par com cobertura em todos os sete checkpoints abaixo de 100%, nos modos seção e municipal; testes/build; revisão independente e correções TDD; confirmação humana antes de merge/push. Congelamento: 25/10 às 12h de Brasília.

- [x] Leitura integral dos dois documentos de estado/fontes, referência Mahlmeister e seção 19 do relatório.
- [x] Estado real: branch `modo-municipal`, HEAD inicial `47dd11c`; alterações preexistentes em `docs/fontes.md`, `docs/progresso-pico.md` e `docs/fontes/` preservadas.
- [x] Produção saudável, fila zero; run `40133213187` criado em 24/10 às 18h12min48s de Brasília com `d6eaf57`; CI `40118693175` aprovado.
- [x] Execuções iniciadas: `data/prepare-order-resume-20261024.log` e `data/holdout-calibration-resume-20261024.log`, sem sobrescrever os logs anteriores.
- [x] Lembrete criado: `realinhar-coleta-eleitoral`, 25/10 às 15h15 de Brasília; somente lembrar, sem ações automáticas em produção.
- [x] Conferir/commitar `config/ordem-1t-2026.json.gz`: commit `1764255`, 499.206 recebimentos utilizáveis e 42 ausentes; hash `079bae7eeec2405ed2b8aa41caa325c03901d309d941537cb48d43d65d73cf4a`.
- [x] Selecionar choques a partir da varredura concluída: 0,03/0,035; resultado provisório de 2022, sem selo estatístico, em `config/calibracao-faixa-2022.json`.
- [x] Corrigir os seis grupos importantes da revisão independente com RED→GREEN.
- [x] Suíte/build: 98/98 e build aprovados após as correções do gerador e o ajuste de eficiência dos lotes. Diff sem erros de whitespace; dry-run do deploy concluído sem alteração externa.
- [ ] Solicitar confirmação para merge/push. Somente depois: CI e primeira publicação produtiva.

Revisão independente concluída, somente leitura e sem Astra; sem segunda revisão após as correções verificadas por TDD. Nenhum voto de teste enviado à produção; nenhum banco apagado. Modelo pontual preservado; somente os dois choques padrão de incerteza foram alterados em `model.ts` nesta retomada.

## Revisão independente e rodada de correções

Revisão do HEAD inicial concluída: seis grupos importantes, zero críticos. Corrigidos em uma rodada: fragmentação de lotes grandes; reconciliação após BU real; inventário indisponível sem bloquear fallback; atualização do conjunto configurado e correção para zero; arquivos municipais defasados permanecem pendentes; política de 1% aplicada a gráfico, mapa e lista.

Regressões RED→GREEN em `data/municipal-review-red*.log`, `data/municipal-review-green.log` e `data/municipal-review-policy-green.log`. A regressão da faixa padrão falhou em 3,875 pp e passou após escolher 0,03/0,035 (`data/calibration-default-{red,green}.log`); teste também confirma que alterar choques não altera a estimativa pontual nem libera vencedor.

Ruling: selecionar o menor par **entre os quatro pares da grade autorizada**, não alegar mínimo contínuo nem cobertura independente de 95%. As 14 verificações (sete checkpoints × dois modos) de 0,03/0,035 já cobriram a verdade; aguardar a conclusão da varredura para consolidar o artefato. Custo se a generalização falhar: faixa futura pode subcobrir; manter rótulo provisório e vencedor desabilitado.

Ruling: não usar 100% para selecionar choques. O universo histórico tem pequenas diferenças contra a verdade completa e o intervalo colapsa em 100%; registrar essa diferença como limitação de cobertura da base, sem alterar o modelo pontual para ocultá-la.

Minors da revisão: terminologia antiga “coleta por seção”/“Último BU”; atualizar para descrever também observações municipais estimadas. Itens não verificáveis nesta rodada: disponibilidade real do TSE em 25/10 e calibração independente entre eleições. Publicação produtiva depende de confirmação expressa após entrega dos resultados locais.

## Conferência do artefato 1T

A primeira geração desta retomada terminou com 499.248 entradas ausentes. A inspeção direta do BWEB2026 confirmou `DT_BU_RECEBIDO` em ISO (`2026-10-04 18:25:49`); o gerador aceitava apenas `dd/MM/yyyy HH:mm:ss`. O artefato inválido não foi commitado e está preservado em `data/ordem-1t-invalida-20261024.json.gz`.

Correção RED→GREEN em `tests/receipt-order.test.ts`: ambos os formatos de data, preservação da primeira chegada e seções agregadas, identidade eleitoral. A extração agora lê somente os metadados de recebimento (os votos já foram validados na base congelada), mantém caches por UF com SHA-512 da origem e SHA-256 dos metadados e recusa ordem inteiramente vazia. Segundos Unix evitam classificar recebimentos anteriores às 17h como ausência. Nova geração em `data/prepare-order-corrected-20261024.log`, reaproveitando os ZIPs já verificados.

Para acelerar a geração corrigida, `data/prepare-order-caches-parallel.mjs` extrai caches de SP/MG/RJ em threads nativas locais, utilizando o mesmo leitor testado e os ZIPs já baixados. Escreve caches por renomeação atômica; não gera o artefato final nem altera a base/modelo. Log: `data/prepare-order-caches-parallel.log`. O processo principal continua gerando o vetor completo a partir desses caches. Em caso de interrupção, preservar ambos os logs e os caches e verificar processos antes de reiniciar.

Commits locais desta retomada: `2aff7ed` (coleta), `252633a` (exibição), `3d10fd2` (choques e evidência da calibração) e `fe6a32d` (datas reais/caches de ordem). `main` local e remoto continuam em `d6eaf57`; nada desta rodada foi enviado.

## Resultado final preparado

Geração corrigida concluída para as 28 UFs/exterior. O leitor real confirmou o SHA-256 da base congelada, vetor de 499.248 unidades, 499.206 horários utilizáveis e ordem presente para **todas** as unidades com histórico. As 42 ausentes correspondem ao universo não modelado. Gzip de 1.142.269 bytes, SHA-256 `079bae7eeec2405ed2b8aa41caa325c03901d309d941537cb48d43d65d73cf4a`, commit `1764255`. Evidência em `data/municipal-order-verified.json`. Todos os processos de geração e os auxiliares locais terminaram.

Para conter a amplificação de escritas do fallback, os lotes agora agrupam até 1.024 registros e continuam subdivididos por limite de 88.000 bytes. A regressão com 5.000 seções detectava 40 lotes antes; agora exige no máximo seis, preservando a soma e o limite de transporte. A API aceita página de recuperação `limit=1..100` (legado=100), e o coletor solicita dez por vez. Regressões RED→GREEN em `data/municipal-transport-efficiency-{red,green}.log`; publicar a API compatível antes de ativar coletores novos. O orçamento antigo de BUs não é ensaio do volume municipal de 25/10: não se afirma cota futura garantida.

Varredura concluída: oito execuções, quatro pares, todos passam nos 14 checkpoints relevantes. Selecionado o menor par, 0,03/0,035. `model.ts` desta retomada mudou exclusivamente essa linha de valores; hash canônico `f1835080b0161880fda5245692f356b711a7cdb35ed68da5c7a28a0cb6b41cbd`.

Suíte final: **98 testes aprovados, zero falhas**. Build/TypeScript aprovados. Dry-run Wrangler no Worker/D1 correto aprovado. Nenhum push, merge, deploy efetivo ou reinício da coleta produtiva nesta rodada; aguardando a confirmação solicitada pelo usuário. O lembrete de realinhamento para 25/10 às 15h15 de Brasília está ativo.

## Atualização posterior à revisão integral de `8e3ee82`

O usuário pediu uma nova revisão antes de produção; ela identificou seis achados importantes adicionais. A rodada de correções autorizada está concluída localmente, sem commit, merge, push ou deploy. **115/115 testes e build/TypeScript aprovados**; regressões cobrem alocação em IDs com BU real, conservação sem truncamento, retirada imediata com fonte incompatível e fila cheia, justiça das retentativas, reconciliação completa entre fragmentos/reinícios e comparação histórica abaixo de 1%.

Ensaio sintético de pico: 499.248 observações, 488 fragmentos, confirmação perdida recuperada, aplicação única e íntegra em 31,84 s neste PC. Isso não comprova latência do TSE ou cotas do Cloudflare. Evidências e decisões em `docs/correcoes-seis-achados-2026-10-24.md`; o relatório anterior de 98 testes é histórico. Modelo, ordem 1T e calibração preservados. Ativação depende de confirmação expressa e de coordenador/grupos com a revisão corrigida.
