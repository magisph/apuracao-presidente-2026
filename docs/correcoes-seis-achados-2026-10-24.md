# Correções dos seis achados da revisão integral

Base da execução: `modo-municipal`, HEAD `8e3ee82`. Escopo autorizado pelo usuário: corrigir os seis achados e testar. Não inclui merge, push ou produção. Alterações preexistentes em `docs/fontes.md`, `docs/progresso-pico.md` e `docs/fontes/` serão preservadas.

Plano e gates:

- [x] 1. Impedir alocação em qualquer seção ocupada por BU real; regressões `received`/`excluded`.
- [x] 2. Exigir conservação do residual; capacidade insuficiente permanece pendente, sem truncamento.
- [x] 3. Retirar estimativas inseguras quando BU real chega e a fonte municipal está defasada/incompatível.
- [x] 4. Atender fila municipal com rotação e retentativas com atraso; testar mais de 200 municípios.
- [x] 5. Entregar/aplicar reconciliações completas, com fragmentos duráveis e recuperação após interrupção.
- [x] 6. Aplicar política de 1% à comparação histórica; testar renderizador e navegador.
- [x] Final. Suíte completa, TypeScript/build, revisão do diff, integridade de modelo/artefatos e documentação atualizada.

Ruling: reutilizar o branch de trabalho existente — alterações anteriores são documentais e não sobrepõem os módulos a corrigir; preservar tudo sem criar checkout divergente. Risco: edição concorrente exigiria nova conferência do diff.

Ruling: as correções seguem o parecer independente já realizado; cada cenário deve falhar antes e passar depois. Não repetir geração da ordem nem calibração, pois não alteram as causas dos seis achados.

## Resultado e evidência por achado

| Achado | Correção | Regressão observada antes/depois |
|---|---|---|
| BU `received`/`excluded` absorvia residual | IDs ocupados por qualquer BU real são inelegíveis; votos de BUs totalizados são contabilizados separadamente | Duas seções: A=120/B=90 permanece na seção livre, sem substituir o BU. Dois testes RED→GREEN |
| Capacidade insuficiente truncava votos | Checagem de capacidade e conservação exata de cada categoria; incompatibilidade não confirma o município | A=220/B=120/brancos=10/nulos=10 contra capacidade 300 rejeitado; fila permanece pendente. Zero seções com votos positivos também rejeitado. RED→GREEN |
| Parcial atrasado mantinha dupla contagem | Retirada imediata após qualquer BU real; em parcial incompatível/indisponível, apenas BUs reais permanecem ativos | Contagem, horário e regressão temporal: três observações indevidas passam a um BU. Cenário adicional com 601 municípios comprovou que a retirada independe do orçamento de 200 consultas. RED→GREEN |
| Fila com falhas bloqueava municípios posteriores | Seleção de itens devidos, rotação dos que falham, retentativas exponenciais limitadas a 60 s | Os 200 primeiros falham; o município 201 entrega A=120/B=90. Falhas não geram consultas em laço sem atraso. RED→GREEN |
| Fragmentos publicavam atualização incompleta | Manifesto lógico com ID/índice/quantidade/hash; preparação integral na outbox; montagem persistida com ledger/cursores; recuperação também no grupo produtor | 2.000 seções: prefixo deixava 1.976 ativas; agora preserva 1.000/A=120.000. Reinício completa a troca de conjunto; resposta perdida repete o mesmo lote e recupera o ledger do grupo. RED→GREEN |
| Tabela histórica mostrava projeção abaixo de 1% | Célula usa a política compartilhada de exibição | Renderizador real: 0,5% oculta, 1% exibe; ensaio sintético mantém projeções. Histórico é preservado. RED→GREEN; navegador confirmou 28 linhas ocultas em 0,5% |

Logs dos ciclos: `data/six-fixes-1-{red,green}.log`, `six-fixes-2-{red,green}.log`, `six-fixes-2-zero-{red,green}.log`, `six-fixes-3-unit-{red,green}.log`, `six-fixes-3-flow-{red,green}.log`, `six-fixes-3-budget-{red,green}.log`, `six-fixes-4-{red,green}.log`, `six-fixes-5-flow-{red,green}.log`, `six-fixes-5-durability-{red,green}.log` e `six-fixes-6-{red,green}.log`, todos em `data/`.

## Validação final

- `npm test`: **115 aprovados, zero falhas**, 58,0 s, em `data/six-fixes-tests-final.log`. A suíte anterior à rodada tinha 98 testes; foram acrescentados 17 cenários.
- `npm run build`: TypeScript e Vite aprovados, em `data/six-fixes-build-final.log`.
- `git diff --check`: sem erros de whitespace nos arquivos da rodada.
- Revisão própria do diff após a rodada de correções do parecer independente; não houve uma nova revisão independente depois desta rodada. Não foram delegados novos agentes.
- Ensaio visual: assets do build em `127.0.0.1:4271`, fixture isolada em modo live, progresso 0,5%; comparação histórica oculta as projeções em todas as 28 linhas. Aba e processo auxiliar encerrados.
- Modelo `src/core/model.ts`, ordem `config/ordem-1t-2026.json.gz` e calibração `config/calibracao-faixa-2022.json` sem diferenças contra HEAD. Hash do gzip continua `079bae7eeec2405ed2b8aa41caa325c03901d309d941537cb48d43d65d73cf4a`.
- Código/testes/documentação estão no working tree de `modo-municipal`, sem commit desta rodada, merge, push ou deploy. Alterações preexistentes preservadas. Nenhuma fixture foi enviada à produção.

## Ensaio de pico do transporte corrigido

`data/six-fixes-peak.mjs` executou uma rajada sintética de **499.248 observações**, usando as funções reais de fragmentação, outbox durável e montagem. Não usa rede nem configuração produtiva.

- 488 fragmentos; maior envelope de requisição: 9.348 bytes, abaixo de 90.000.
- Preparação/persistência integral: 11,16 s; fluxo completo com recuperação: 31,84 s neste PC.
- Confirmação perdida no segundo fragmento; outbox reaberta e montagem restaurada após serialização do checkpoint.
- Nenhuma aplicação antes de completar; exatamente uma aplicação final, A=59.909.760/B=44.932.320; fila durável termina vazia.
- Pico de RSS do processo: aproximadamente 986 MiB.
- Resultado integral em `data/six-fixes-peak.json`.

Esse ensaio verifica consistência, durabilidade, volume e tempo locais para esses dados sintéticos. Não mede latência/disponibilidade do TSE, latência de upload, compressibilidade de todos os dados reais nem cotas do Cloudflare. Não altera nem revalida a precisão estatística da faixa provisória de 2022.

## Decisões e próximo gate

Ruling: retirar estimativas quando o parcial está incompatível ou indisponível — evita manter residual inseguro ao lado de BU novo, com custo de redução temporária da cobertura até a reconciliação segura. BUs reais são preservados.

Ruling: a unidade atômica do transporte é o ciclo de observações do grupo — mantém BUs, estimativas e retiradas da mesma coleta juntos, com custo de esperar todos os fragmentos antes de atualizar a projeção do grupo.

Ruling: o Worker mantém payloads opacos e nenhuma migração é necessária para o manifesto — compatibilidade preservada, mas coordenador antigo não pode consumir produtores municipais novos. Ativar a API compatível e garantir coordenador/grupos na revisão corrigida antes da coleta municipal.

Os seis achados estão corrigidos no escopo local validado. **Publicação ainda não executada:** exige confirmação expressa do usuário para commit/merge/push e ativação, seguida de CI e verificação da primeira publicação real. A faixa continua provisória e vencedor/probabilidade estatística permanecem desabilitados.

**Autorização posterior recebida:** o usuário determinou o envio para produção e publicação. A execução e os resultados externos estão registrados em `docs/publicacao-municipal-2026-10-24.md`; os estados locais acima descrevem a conclusão da rodada de correções, antes dessa autorização.
