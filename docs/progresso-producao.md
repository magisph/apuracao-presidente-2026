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

Publicado: repo magisph/apuracao-presidente-2026 e Worker64f28f78-1db5-4b7b-8b9e-f62a179ade67; D1 novo0827acf3-6d7f-4351-b361-4e19e1fad55f recebeu10statements após conferir ausência de tabelas. Outros recursos preservados.
Segredo: gerado aleatoriamente e configurado por stdin no Worker/GitHub, sem valor em logs ou Git. Varredura do staging:91arquivos,0paths proibidos e0exposições da chave.
Base: Release gzip8.514.633bytes, hash do JSON2d2f46c70fff94782d60e8ee6b66e39b83b457ade6010414c345e9a2b15d61ff;6runners conferiram o hash.
Revisão independente:1P2, prazo absoluto ignorado pelo processo. Corrigido via collectionStopAt e env no workflow; teste schedule RED→GREEN; suíte58/58 e build passaram. Commitc9ba9e6. Nenhum outro achado importante confirmado pelo revisor.
Ensaio1:40105501146 concluído com sucesso (6jobs,2min); CI40105377318 aprovado.
Ensaio2:40105848462 concluído com sucesso; CI40105846905 aprovado com58testes; job continue disparou automaticamente40106029417.
Operação:40106029417 em execução com6coletores; owners remotos confirmados no D1; epochs coordinator4/g0-g4=3. Deadline26/10/2026 12:00UTC=9hBrasília.
Integridade externa:401 sem autenticação; lote administrativo vazio201/200, conflito409 eepoch0=409; publicação incompleta409 eúltimo snapshot preservado;71blobs municipais e22municípios AC lidos. Sem inserir votos sintéticos.
Métricas iniciais:145invocações,0erros; CPU P50=3,874ms/P99=10,481ms (unidade microseconds confirmada na introspecção GraphQL). Não comprova carga de pico. D1 após retomadas565.248bytes.
Gates remanescentes: calibração nacional/95%, pico eleitoral completo e desligamento físico do PC não comprovados; fonte e execução reais de pré-apuração e runners remotos comprovadas.

Verificação final do limite: fetchBeforeDeadline cancela HTTP no prazo, preservando os sinais individuais. Teste RED→GREEN e suíte59/59. CI40106658863 (38e0fd7) aprovado. Execução com prazo já vencido encerrou antes de consultas/fontes. UI de diagnóstico atualizada para orientar consulta aos grupos, removendo o aviso histórico de nuvem não implantada.
Worker final com assets: versão8d7a7095-bb74-409f-aeeb-35bb211d9a4a. Após republicação, ingestão autenticada200, histórico3 versões,645municípios SP descomprimidos/validados,health ok e5grupos ok. Fonte oficial0votos e0BUs observados, sem confundir persistência de teste com voto real.

Ajuste operacional final: variáveis de repositório podem ficar capturadas na execução em andamento. Encerramento imediato exige desabilitar o workflow/cancelar os jobs; apenas trocar CHAIN_ENABLED pode permitir mais um ciclo. Reinício final será disparado explicitamente com CHAIN_ENABLED=true e a revisão final publicada.
