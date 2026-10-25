# Publicação do modo municipal e das seis correções

Autorização expressa do usuário: “Prossiga e envie para produção e publicação”. Branch inicial `modo-municipal`, HEAD `8e3ee82`; produção e remoto `main` inicialmente em `d6eaf57`.

Plano de execução:

- [x] Conferir alvo, autenticação, versão anterior e saúde; preservar alterações locais fora da entrega.
- [x] Reexecutar suíte/build; commit somente dos arquivos da entrega; integrar `main` por fast-forward e enviar sem força.
- [x] Acompanhar o CI Linux da revisão enviada.
- [x] Validar dry-run e publicar API/assets no Worker existente, sem migrações ou credenciais novas.
- [x] Encerrar a execução antiga, verificar continuação e ativar todos os coletores na revisão corrigida.
- [x] Conferir primeira publicação real, hash de modelo, base, cinco grupos, interface pública e estado final.

Alvos: repositório `magisph/apuracao-presidente-2026`; Worker `apuracao-presidente-2026`; D1 `0827acf3-6d7f-4351-b361-4e19e1fad55f`, conforme `worker/wrangler.toml`. Nenhum banco será apagado e nenhum dado sintético será enviado à produção.

Rollback: registrar o ID da implantação vigente antes de publicar; se necessário, reimplantar a revisão estável e reiniciar coordenador/grupos juntos na revisão correspondente. Não reescrever Git nem executar migrações. Os dados existentes e lotes duráveis permanecem preservados.

Arquivos preexistentes excluídos do commit: `docs/fontes.md`, `docs/progresso-pico.md`, diretório `docs/fontes/`. Seus hashes locais estão registrados em `data/publish-preserved-local-files.json`.

Ruling: autorização direta para publicação substitui o menu de escolha da habilidade de finalização; não pedir confirmação redundante para merge/push/deploy já autorizados. Manter o branch de desenvolvimento e o checkout, sem limpeza destrutiva.

## Conferência anterior ao envio

Suíte reexecutada: 115 aprovados, zero falhas (`data/publish-tests-20261024.log`). TypeScript/build aprovados (`data/publish-build-20261024.log`). Autenticação da CLI e conta do TOML confirmadas. Dry-run do Worker/assets aprovado (`data/publish-dry-run-20261024.log`). Hashes dos oito arquivos de código/testes conferem com a evidência das correções.

Versão Cloudflare anterior: `8d7a7095-bb74-409f-aeeb-35bb211d9a4a`, implantação de 24/10 às 15h18 UTC; lista preservada em `data/deploy-previous-versions.log`. Produção consultada: snapshot `live-13`, sequência 13, modo live, votos oficiais zero e modelo anterior `5ae9c873a8996d5c590dde80d5d8368ee53ed067a41829e2fe430e82e7a02ae3`. Run antigo `40133213187` em andamento. Remoto `main=d6eaf57` é ancestral do branch a integrar.

## Envio e implantação realizados

- Commit das seis correções: `455bcaa69c42bbdeb2bcacbe0ccf38715f0b88a0`; integração de `modo-municipal` em `main` por fast-forward e push normal confirmados. Branch de desenvolvimento preservado.
- CI Linux/Node 24: run `40152712705`, concluído com sucesso em 54 s; 115 testes, build e auditoria sem vulnerabilidades. Logs preservados em `data/publish-ci-full-40152712705.log`.
- Deploy Cloudflare concluído: versão `d06d6592-1c84-446b-961d-a00c62f205a6`, implantação `cb63ee67-c1d9-4923-a3e8-510bc151dde7`, criada em `2026-10-25T02:00:55.304601Z`, 100% do tráfego. Worker/D1/bindings existentes preservados; nenhuma migração ou troca de segredo.
- `/` e `/assets/index-D-qOyIEk.js` responderam 200 com a interface nova. O script público tem 37.019 bytes.
- Run antigo `40133213187` encerrado por cancelamento controlado; os seis jobs terminaram. O job de continuação concluiu com sucesso e criou automaticamente `40152941861`, na revisão `455bcaa`, em `2026-10-25T02:02:39Z`. Não foi disparado segundo run manual.
- Primeira publicação com o modelo calibrado conferida após aquisição dos leases e carregamento da base: detalhes abaixo.

## Primeira publicação real verificada

Verificação em `2026-10-25T02:04:33.004Z` (24/10 às 23h04 de Brasília), sem enviar dados de teste:

- Snapshot `live-14`, sequência 14, criado em `2026-10-25T02:03:54.478Z`, modo `live`; contrato validado com o validador real do sistema.
- Hash do modelo `f1835080b0161880fda5245692f356b711a7cdb35ed68da5c7a28a0cb6b41cbd`, igual ao blob Git do código publicado.
- Base `2d2f46c70fff94782d60e8ee6b66e39b83b457ade6010414c345e9a2b15d61ff`; 499.206 unidades modeladas, 42 sem histórico preservadas fora do modelo.
- `/api/health`: `state=ok`, fila zero e todos os cinco grupos `g0..g4` saudáveis, com confirmações posteriores à ativação. Coordenador e grupos executam na revisão `455bcaa` do run `40152941861`.
- HTML aponta para `/assets/index-D-qOyIEk.js`; SHA-256 do JavaScript remoto `b43f547e9bb8e4646847ef384fd1195cfcb421e268374fe9ba1bc3cd0223a17a`, igual ao build local testado.
- 28 territórios e 22 municípios do Acre recuperados na mesma sequência publicada.
- Navegador público: diagnóstico mostrou `live-14` e o hash novo; navegação Acre → municípios carregou a lista real. Comparação histórica mostrou, por exemplo, PORTO WALTER com 50,95%/44,16%/4,89% no primeiro turno e projeção de segundo turno oculta em pré-apuração.
- Fonte oficial ainda em pré-apuração: zero votos válidos; nenhuma seção estimada. Vencedor estatístico nulo e calibração independente falsa, conforme previsto. Isso comprova publicação e funcionamento com os dados oficiais disponíveis; não comprova precisão futura durante a eleição.

Evidência integral: `docs/evidencias/publicacao-municipal-producao.json`; logs locais em `data/publish-verification-live.log` e `data/publish-production-verified.json`. A consulta de leases do D1 foi somente leitura e confirmou os seis donos vinculados ao run novo, sem escrita de linhas.

## Estado final e continuidade

Modo municipal, ordem 1T verificada e choques provisórios 0,03/0,035 publicados. CI, Worker/assets, processo remoto e primeira publicação real confirmados. O Worker/D1 não recebeu migração nem dados sintéticos. O PC pode permanecer sem o coletor local; a execução ativa está nos seis runners.

O run continua com duração operacional de 345 min e encadeamento já configurado, respeitando o prazo existente de 26/10 às 9h de Brasília. O lembrete previamente criado para 25/10 às 15h15 foi preservado. Os resultados de capacidade são os ensaios registrados; disponibilidade do TSE, cotas sob o pico real e precisão estatística futura continuam sujeitos às limitações documentadas.
