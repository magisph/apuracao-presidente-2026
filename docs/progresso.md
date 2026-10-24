# Ledger — docs/superpowers/plans/2026-10-24-apuracao.md

Ruling: diretório inicial vazio e sem Git; implementar no workspace solicitado, sem criar commit ou worktree — não há checkout a isolar.
Ruling: scripts de ledger dependentes de commits substituídos por este arquivo persistente — publicação Git não autorizada.
Pre-flight: tipos partilhados por motor/coleta/API/UI; universo modelado é explícito e separado de EA20.
Ruling: intervalos e selo exigem validação empírica; implementar intervalo nominal e manter selo bloqueado até esse gate.

Tarefas 1–2: núcleo e motor implementados; primeira execução RED por módulos ausentes, depois invariantes/correções/intervalos GREEN.
Tarefa 3: EA20, EA16 e BU reais validados; JWS real verificado com chave oficial confirmada no manual TSE Apêndice B. Scanner usa geração somente para agendamento. Importação BWEB por streaming ZIP/CSV com SHA512, ano/eleição/cargo e agregações.
Tarefa 4: Worker/D1 exercitado com SQLite real em memória, autenticação, idempotência, fencing e publicação atômica. Sem provisionamento externo.
Tarefa 5: build aprovado; painel aberto no navegador real, seleção Ceará e busca Exterior confirmadas. Validação de resoluções em andamento.
Revisão independente: corrigidos fluxo de exclusão/ambiguidade, ordenação por versão da fonte, importação de outra eleição, contrato numérico de snapshots, resposta atrasada ao trocar modo e sequência local. Paginação usa rowid monotônico e cursores persistidos.
Ruling: eleitorado 1T é referência provisória até confronto por BU 2T; nenhuma diferença é subtraída arbitrariamente. Correspondência incompleta é explicitada e fica fora do universo modelado. Esta regra substitui o bloqueio inicial de toda a consolidação: o inventário completo pode conter unidades sem histórico, com eleitorado individual null.
Ruling: conservar apenas arquivos derivados e manifestos das novas importações nacionais, após conferir SHA512 do arquivo original — reduz ocupação; arquivos ZIP preexistentes preservados.

Base consolidada: 499.248 unidades EA16; 499.206 com correspondência BWEB 1T; 42 unidades do exterior sem histórico, identificadas individualmente e com eleitorado null. Reconciliação EA12/14/16 assinada concluída. Soma conhecida de eleitorado 1T 158.745.007 versus 158.745.502 no EA20 2T; diferenças por UF preservadas, sem atribuição automática de causa.
Revisão dos novos fluxos: corrigidos retomada de publicação parcial (sequência reservada), assinatura lógica incluindo ledger municipal, download atômico e cache derivado verificado, cache EA16/EA18 fora de sincronia, lock local com SQLite, replay/seleção municipal e custo de armazenamento. Páginas comprimidas são endereçadas pelo conteúdo e referenciadas por manifestos; as bateladas também são comprimidas.
Ruling: publicação inicial na nuvem a cada 90s, com consulta oficial nominal de 15s; execução local nominal de 15s — orçamento conservador do plano gratuito tem prioridade sobre repetir snapshots municipais a cada 15/30s. Custo: a projeção publicada pode ficar mais antiga entre versões. Cadência configurável e sujeita a teste real.
Desempenho: 499.248 seções, 4.993 observações sintéticas e 400 réplicas: 37.086ms antes e 5.968ms depois da indexação dos sorteios. Diferença numérica máxima zero nos 24 cenários de stress comparados.
Teste histórico: AC2022, 2.124 unidades em ambos os turnos, ordem de recebimento reconstruída. Sem ajuste posterior dos parâmetros. Não habilita selo ou precisão nacional.
Verificação local: 43 testes, typecheck e build aprovados; execução nativa de coordenador + cinco grupos consultou fontes reais e persistiu snapshots, heartbeat e páginas municipais. 28 abrangências EA20 retornaram dados de pré-apuração (zero votos).
Final review: revisão independente concluída em duas passagens devido aos novos fluxos incorporados após a primeira. Os achados importantes foram corrigidos e cobertos por regressões/validação de runtime. Nenhum commit, PR ou deploy efetuado.
Gates externos: não verificados CPU/quotas do Worker/D1 publicado, disponibilidade de runners, retomada entre jobs e PC desligado. Gate estatístico: validação nacional independente, inclusive2014/2018/2022 e regra de chamada, ainda bloqueia o selo.

Tarefa6: revisão,43 testes, build, auditoria npm sem vulnerabilidades e checagem no navegador concluídos localmente. Navegação municipal, atualização mantendo seleção e replay entre versões5/6 confirmados com22 polígonos/territórios do Acre. Captura final salva, overrides de viewport e zoom restaurados. Relatório registra as partes ainda não verificadas; não se declara concluída a homologação estatística ou a operação externa.
