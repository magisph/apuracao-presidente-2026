# Ensaio de pico e validação histórica — 24/10/2026

Autorização: testar pico eleitoral, corrigir limites e preservar produção; desligamento físico fora do escopo.

1. [x] Confirmar prazo: encerra somente coleta/encadeamento, sem apagar painel ou histórico.
2. [ ] Executar fluxo nacional de 499.248 unidades: ledger, correções, gzip, transporte, recuperação e projeção hierárquica.
3. [ ] Exercitar o mesmo Worker e D1 em ambiente isolado na Cloudflare, com ingestão concorrente e leitores. Nunca enviar votos sintéticos ao Worker público de produção.
4. [ ] Ampliar avaliação histórica nacional a partir do catálogo primário TSE; registrar hashes e limitações temporais.
5. [ ] Corrigir defeitos reproduzidos, verificar suíte/build e publicar ajustes autorizados.
6. [ ] Registrar medidas, orçamento residual, estado da produção e limites efetivamente comprovados.

O teste não fará carga sobre o servidor do TSE: simulação em massa e carga externa serão dirigidas exclusivamente ao ambiente isolado deste projeto. Sem novo plano pago.
