# Estado da execução — 24/10/2026, cerca de 16h50 de Brasília

## Já em produção (main = d6eaf57, push feito, CI verde)
Publicação municipal concorrente, resiliência a falhas transitórias (D1/5xx/429) e supervisor de reinício. O run de coleta 40106976330 usa o código antigo até a troca de ciclo (~18h15 de Brasília de hoje); o run seguinte sobe com d6eaf57.

## Em andamento no branch local `modo-municipal` (NÃO publicado)
Objetivo: projeção funcionar mesmo se o TSE não publicar BUs por seção durante a noite (achado da análise em `docs/analise-fontes-projecao-2026-10-24.md`).

Commits: a2f0cdd (estimador municipal + regra do ledger: BU real sempre substitui estimativa) e df2ccd1 (grupos leem `-ab.json` + EA20 municipal e enviam observações estimadas). Commit WIP desta nota: modelo com choques calibráveis (`NATIONAL_SHOCK`/`UF_SHOCK` em `src/core/model.ts`, valores provisórios 0,045/0,05 × √fração restante), `evaluateMunicipal`, modos do holdout (`HOLDOUT_MODE`, `HOLDOUT_ORDER`, `HOLDOUT_SHOCKS`), regra de exibição (oculta <1%, aviso até 2,5%) e textos do painel.

Validação 2022 (erro em pp, por fração 1/3/5/10/15/20/50%):
- modo municipal com ordem do 1º turno: 0,49 / 0,46 / 0,45 / 0,48 / 0,62 / 0,62 / 0,29
- modo municipal com seções certas (configuração ao vivo): 0,47 / 0,30 / 0,19 / 0,15 / 0,15 / 0,13 / 0,04
- modo BU: 0,47 / 0,29 / 0,19 / 0,14 / 0,13 / 0,11 / 0,03

## Processos em background (resultados em arquivos)
- `data/prepare-order.log` → gera `config/ordem-1t-2026.json.gz` (ordem de recebimento do 1º turno). Precisa ser commitado; sem ele o coletor usa ordem por identificador.
- `data/holdout-calibration.log` → `data/holdout-national-2022/report-calibration.json`: cobertura e largura por par de choques (0,03:0,035; 0,045:0,05; 0,07:0,07; 0,1:0,1) nos modos seção e municipal.

## Próximos passos (antes do congelamento de 25/10, 12h de Brasília)
1. Escolher os choques: o menor par com cobertura em todos os checkpoints <100% nos dois modos; atualizar `NATIONAL_SHOCK`/`UF_SHOCK` e os testes.
2. Commitar `config/ordem-1t-2026.json.gz`; `npm test`, `npm run build`.
3. Revisão independente do branch; corrigir achados com teste.
4. Com confirmação do usuário: merge em main, push, CI e verificação da primeira publicação.
5. 25/10, 15h15 de Brasília: realinhamento do run (ver `docs/nuvem.md`).
- 24/10 ~17h: suíte do commit 94eea5b: 87/87 aprovados. Ordem do 1º turno em PR; calibração iniciou as varreduras (resultado por linha JSON em data/holdout-calibration.log).

## Interrupção a pedido do usuário (24/10, ~17h05 de Brasília)
Processos `prepare-order.ts` (parou depois de PR) e calibração (`holdout-national.ts`, sem resultado final) encerrados. Retomada:
- Ordem do 1º turno: `node --max-old-space-size=6144 --experimental-strip-types scripts/prepare-order.ts > data/prepare-order.log 2>&1` (ZIPs já baixados em `data/historical/` são reaproveitados por SHA-512).
- Calibração: `HOLDOUT_SHOCKS="0.03:0.035,0.045:0.05,0.07:0.07,0.1:0.1" node --max-old-space-size=8192 --experimental-strip-types scripts/holdout-national.ts > data/holdout-calibration.log 2>&1` (~25 min; saída em `data/holdout-national-2022/report-calibration.json`).
- O monitor da primeira publicação do run novo deixou de existir: conferir `/api/health` e GitHub Actions manualmente.
