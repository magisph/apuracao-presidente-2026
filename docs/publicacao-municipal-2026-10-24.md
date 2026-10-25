# Publicação do modo municipal e das seis correções

Autorização expressa do usuário: “Prossiga e envie para produção e publicação”. Branch inicial `modo-municipal`, HEAD `8e3ee82`; produção e remoto `main` inicialmente em `d6eaf57`.

Plano de execução:

- [x] Conferir alvo, autenticação, versão anterior e saúde; preservar alterações locais fora da entrega.
- [ ] Reexecutar suíte/build; commit somente dos arquivos da entrega; integrar `main` por fast-forward e enviar sem força.
- [ ] Acompanhar o CI Linux da revisão enviada.
- [ ] Validar dry-run e publicar API/assets no Worker existente, sem migrações ou credenciais novas.
- [ ] Encerrar a execução antiga, verificar continuação e ativar todos os coletores na revisão corrigida.
- [ ] Conferir primeira publicação real, hash de modelo, base, cinco grupos, interface pública e estado final.

Alvos: repositório `magisph/apuracao-presidente-2026`; Worker `apuracao-presidente-2026`; D1 `0827acf3-6d7f-4351-b361-4e19e1fad55f`, conforme `worker/wrangler.toml`. Nenhum banco será apagado e nenhum dado sintético será enviado à produção.

Rollback: registrar o ID da implantação vigente antes de publicar; se necessário, reimplantar a revisão estável e reiniciar coordenador/grupos juntos na revisão correspondente. Não reescrever Git nem executar migrações. Os dados existentes e lotes duráveis permanecem preservados.

Arquivos preexistentes excluídos do commit: `docs/fontes.md`, `docs/progresso-pico.md`, diretório `docs/fontes/`. Seus hashes locais estão registrados em `data/publish-preserved-local-files.json`.

Ruling: autorização direta para publicação substitui o menu de escolha da habilidade de finalização; não pedir confirmação redundante para merge/push/deploy já autorizados. Manter o branch de desenvolvimento e o checkout, sem limpeza destrutiva.

## Conferência anterior ao envio

Suíte reexecutada: 115 aprovados, zero falhas (`data/publish-tests-20261024.log`). TypeScript/build aprovados (`data/publish-build-20261024.log`). Autenticação da CLI e conta do TOML confirmadas. Dry-run do Worker/assets aprovado (`data/publish-dry-run-20261024.log`). Hashes dos oito arquivos de código/testes conferem com a evidência das correções.

Versão Cloudflare anterior: `8d7a7095-bb74-409f-aeeb-35bb211d9a4a`, implantação de 24/10 às 15h18 UTC; lista preservada em `data/deploy-previous-versions.log`. Produção consultada: snapshot `live-13`, sequência 13, modo live, votos oficiais zero e modelo anterior `5ae9c873a8996d5c590dde80d5d8368ee53ed067a41829e2fe430e82e7a02ae3`. Run antigo `40133213187` em andamento. Remoto `main=d6eaf57` é ancestral do branch a integrar.
