# Publicação — 24/10/2026

Autorização: usuário solicitou prosseguir com as etapas de envio para produção e ajustar pendências. Inclui criação do repositório público, Worker/D1, configuração de secrets e execução dos coletores; não inclui serviços pagos.

1. Inventário: GitHub magisph e Cloudflare conta7b4711d66144a4c3e4f93192d03d0c67 autenticados. Nenhum recurso com o nome apuracao-presidente-2026 encontrado. Recursos RV-Adv existentes fora do escopo.
2. Preparar: testes/build/dry-run, configuração de assets e armazenamento, fluxo de ensaio curto, base congelada com hash e publicação em Release.
3. Publicar: repo público por allowlist; D1 novo e schema somente nesse banco; Worker com Static Assets e segredo de ingestão; GitHub variables/secrets.
4. Verificar: ensaio de runner, idempotência/fencing/publicação, leitura real pública e diagnóstico, retomada entre execuções e encadeamento.
5. Entregar: URLs, revisão/versão/base, testes executados e limites que permaneçam sem prova.

Ruling: frontend no Workers Static Assets com mesma origem da API, evitando um projeto Pages separado; arquivos estáticos não consomem a mesma quota de requisições dinâmicas. Não há mudança no contrato da API.
Ruling: encadeamento usa GITHUB_TOKEN efêmero com actions:write somente no job de continuação; workflow_dispatch é exceção documentada que permite disparar outra execução. Nenhum token pessoal copiado para CI.
Ruling: não subir base nem checkpoints grandes em cada artefato Actions. Release contém a base pública comprimida e imutável; artefatos contêm somente outbox/saúde por2dias.
Ruling: precisão nacional independente permanece não comprovada; publicar como projeção experimental, com winner=null e intervalos nominais. Publicação não homologa precisão.
