# Correções da revisão — 24/10/2026

Registro da etapa local anterior à publicação. A implantação posterior e as evidências externas atuais estão em [nuvem.md](nuvem.md).

## Entrega local

1. **Lotes:** fila durável antes do envio, ID e payload estáveis, repetição com backoff e remoção somente após confirmação. Timeout após commit remoto reenvia a mesma identidade idempotente. Testes também executam `scripts/collect.ts` em processos isolados, com transporte controlado.
2. **Saúde:** estado declarado e idade do heartbeat são condições independentes; erros/quarentenas não viram `ok` por chegada de lote ou heartbeat recente.
3. **Projeção:** um ajuste hierárquico nacional por versão, previsões por unidade somadas para Brasil/UF/município e mesmos sorteios nos intervalos. Território sem observação pode receber estimativa pela hierarquia, com progresso local zero. Somas de quantis não representam intervalo nacional.
4. **Avaliação:** preparação histórica e ledger compartilhados com a operação, sem eleitorado futuro substituindo a referência. Verdade final inclui todas as unidades, e rejeições são reportadas.
5. **Eleitorado:** diferença entre referência 1T e BU atual é auditada; os votos são validados contra o eleitorado atual. Não se altera o histórico nem se força igualdade com EA20. Identidade incorreta, votos impossíveis e conflitos continuam bloqueados.
6. **Proveniência:** `historicalSectionsSha256` preserva o estágio importado; `sectionsSha256` passa a representar as seções finais reconciliadas. Coletor verifica os hashes. Base anterior preservada em backup local.
7. **Replay:** todas as páginas são carregadas; atualizações aproveitam o cache. Cursor exclusivo disponível no servidor local e Worker. Respostas municipais atrasadas não retomam um escopo abandonado.

## Evidências atuais

- AC2022 pelo ledger operacional: 2.124 unidades aceitas, zero rejeitadas e 210 diferenças de eleitorado registradas. Resultado final exatamente igual à soma dos votos; erro de 3,577 pp no primeiro ponto, 0,351 pp em aproximadamente 20,59% do eleitorado observado e 0,397 pp em aproximadamente 51,27%. Sem ajuste de parâmetros após olhar este teste.
- Benchmark com 499.248 unidades reais de referência e 4.993 observações sintéticas: 400 réplicas com agregação de 28 UFs e 5.757 municípios em aproximadamente 8,8 s; RSS de aproximadamente 581 MB. Diferença entre soma das UFs e nacional inferior a 0,001 voto, por ponto flutuante.
- Orçamento sintético atualizado: aproximadamente 273 MB de dados, 71.223 linhas escritas e 74.461 requisições/dia no cenário de 6h de mudanças. Maior requisição municipal medida: 62.920 bytes, abaixo do limite interno de 90.000. Não inclui CPU/índices reais, retries extras ou audiência adicional.
- Verificação dos derivados finais: 28/28 hashes por UF conferem. Inventário preservado: 499.248 unidades, 499.206 correspondências e 42 sem histórico.

## Gates que não se resolvem por alteração de código

**Precisão nacional: Bloqueado.** O teste real atual cobre uma UF e uma eleição. O catálogo oficial de BUs de 2022 fornece arquivos finais; ordenar pelo recebimento não recupera todo o histórico de versões e correções. Não há evidência suficiente para habilitar vencedor estatístico ou afirmar cobertura nacional de 95%. O selo continua bloqueado e os intervalos são nominais.

**Operação externa: Não verificada.** Nenhum repositório ou recurso Cloudflare foi publicado. D1/Actions reais ainda precisam de ensaio de gravação, retomada, fencing, CPU/quotas, continuidade e PC desligado. Os testes SQLite locais e o orçamento não substituem esse ensaio.

Fontes primárias revisitadas: [BUs TSE 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022-boletim-de-urna), [limites D1](https://developers.cloudflare.com/d1/platform/limits/), [preços D1](https://developers.cloudflare.com/d1/platform/pricing/) e [limites Workers](https://developers.cloudflare.com/workers/platform/limits/). Workers Free informa 100.000 requisições/dia e 10 ms de CPU; D1 Free informa 500 MB por banco. São limites documentados, sem verificação da conta do usuário.

## Verificação final

57 testes passaram, sem falhas; TypeScript e build passaram; npm audit retornou zero vulnerabilidades conhecidas. O revisor independente executou os55 testes então existentes e apontou2 falhas de interface. Ambas receberam regressões RED→GREEN antes da suíte final de57 testes. Não houve segunda revisão independente após essa correção; os novos testes e a suíte completa verificaram a rodada.

Navegador: ensaio sintético e oficial, seleção Acre→Porto Walter, atualização e replay municipal conferidos. Endpoints locais retornaram live-8/modelo v2,7 versões anteriores com cursor exclusivo e22 municípios do Acre. O servidor de verificação foi iniciado em127.0.0.1:4269; o processo anterior4268 foi preservado.

Manifesto em `docs/evidencias/manifest.json`; logs em `data/tests-review-final.log`, `data/build-review-final.log` e `data/audit-review-final.json`. Nenhuma garantia de precisão ou continuidade é inferida desses resultados locais. Nenhum commit, push, repositório ou recurso Cloudflare foi criado.
