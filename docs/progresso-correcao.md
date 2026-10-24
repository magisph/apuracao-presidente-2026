# Ledger — docs/superpowers/plans/2026-10-24-correcoes-revisao.md

Pre-flight: coletor → Worker compartilham contrato de lotes imutáveis; outbox preservará identidade/payload após timeout.
Pre-flight: modelo → snapshots → municípios devem compartilhar previsões por unidade e os mesmos sorteios.
Pre-flight: holdout deve passar pela identidade/base/ledger operacional antes de chamar o motor.
Pre-flight: API local/nuvem → UI compartilham cursor exclusivo `before`.
Ruling: diretório sem Git; preservar conteúdo e registrar verificação em arquivos, sem publicação.

Task 1: complete — outbox persistida antes do envio, retry com backoff e mesma identidade após timeout/reinício. Testes delivery RED (módulo ausente) → GREEN; collector-flow executa o script real em processos isolados e comprova reenvio.
Task 2: complete — saúde declarada preservada; heartbeat recente não apaga falhas. Testes delivery/collector-flow aprovados.
Task 3: complete — projectHierarchy ajusta uma vez e agrega as mesmas previsões/sorteios por território. Testes hierarchy RED → GREEN. Benchmark nacional: 8.807 ms, 400 réplicas, 5.757 municípios; diferença de soma abaixo de 0,001 voto por ponto flutuante.
Task 4: complete (correção do avaliador) — historicalReference compartilhada; evaluateOperational usa SectionLedger; verdade completa. Testes evaluation RED → GREEN. AC2022: 2.124 aceitas, 0 rejeitadas, 210 diferenças de eleitorado auditadas; resultado exato no final.
Ruling: substituída a quarentena por simples diferença de eleitorado entre turnos — a releitura AC2022 mostrou 210 diferenças em BUs oficiais; conservar a referência histórica e validar votos contra o eleitorado atual evita descartar votos por mudança de cadastro. Identidade, sobrecontagem e conflito de versão permanecem bloqueados.
Task 5: complete — hashes de estágio histórico preservados e hashes finais recalculados; verificação de 28 UFs passou. Original preservado em data/review-backup-20261024/data/base.json. Teste provenance RED → GREEN.
Task 6: complete (código/testes) — paginação completa/cursor exclusivo local+nuvem, cache incremental, cancelamento municipal em troca de modo/escopo. Testes history RED → GREEN: 365 versões, atualização sem baixar novamente páginas antigas e cursor sem avanço.
Task 7: em andamento — suíte/build/audit, navegador e revisão independente final.

Final review: revisor independente executou55/55 testes e typecheck; não encontrou defeitos confirmados em entrega/saúde/modelo/avaliação/proveniência. Apontou2 P2 de interface: falha HTTP na primeira página silenciosa e resposta municipal tardia desfazendo outra seleção.
Final: fixed primeira página HTTP — readHistoryPage rejeita não-OK; history.test RED→GREEN, incluído no carregamento inicial e demais páginas.
Final: fixed seleção municipal tardia — guarda inclui escopo solicitado/atual e handlers invalidam geração; regressions.test RED (true≠false)→GREEN.
Final: suíte57/57 e build aprovados após a rodada de correção; endpoints reais locais latest/history?before/municipalities retornaram live-8/modelo v2,7 versões anteriores e22 municípios AC.
Final: Ruling: itens externos deixados pelo revisor — não inferir calibração nacional/95%, CPU/quota/retomada Cloudflare/Actions ou PC desligado a partir de testes locais; permanecer explícitos no relatório. Custo de ignorar: falsa confiança eleitoral/operacional.
Final: Ruling: sem Git não há branch/base a integrar; finalizar com arquivos locais preservados, sem menu de merge/publicação nem limpeza de worktree.
Task 7: complete (validação local e revisão) — gates estatísticos nacionais e externos permanecem pendentes, não declarados completos.

Navegador em servidor isolado127.0.0.1:4269: modo sintético, modo oficial com zero votos/aviso de coleta parcial, Acre→Porto Walter, atualização preservando seleção e replay #7→#6 preservando município e22 polígonos conferidos. Servidor anterior4268 preservado.
Fontes revisitadas: catálogo oficial BUs2022 (arquivos finais), limites/preços D1 e limites Workers. Leituras públicas apenas; nenhum recurso externo criado.
