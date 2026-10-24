# Vértice — apuração presidencial 2026

Painel desktop local com dados oficiais do TSE, coleta de boletins de urna, projeção experimental e replay. O ensaio usa dados inteiramente sintéticos. **A precisão eleitoral ainda não foi comprovada por validação retrospectiva independente; o selo estatístico de vencedor fica bloqueado.**

## Acessar publicado

[Abrir o Vértice](https://apuracao-presidente-2026.phdtemiranda.workers.dev/) · [Repositório público](https://github.com/magisph/apuracao-presidente-2026) · [Operação e evidências](docs/nuvem.md)

## Abrir no PC

No PowerShell, dentro desta pasta, com Node.js 24 ou superior:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

Abra **http://127.0.0.1:4268/** para dados oficiais ou **http://127.0.0.1:4268/?mode=simulation** para o ensaio. O servidor fica restrito ao próprio PC. Use o seletor no cabeçalho para alternar os modos. O ensaio não é resultado eleitoral.

## Base e coleta

```powershell
node --experimental-strip-types scripts/prepare-base.ts ALL
node --experimental-strip-types scripts/reconcile-base.ts
npm.cmd run collect:local
```

A preparação consulta o catálogo oficial, verifica SHA-512 dos ZIPs, processa CSV por fluxo e confronta membros de seções com EA16. Pode transferir vários GB; conserva os derivados e manifestos, removendo somente ZIPs novos já conferidos. ZIPs preexistentes são preservados. `--keep-archives` conserva todos. O eleitorado 1T é referência histórica; diferenças no BU 2T são registradas no diagnóstico. Os votos precisam respeitar o eleitorado do próprio BU. Não alterar a base durante a coleta: seu hash identifica o universo e os checkpoints.

O coletor local inicia coordenador e cinco grupos, equilibrados pelo número de urnas principais. `Ctrl+C` encerra os processos. A coleta local para com o PC desligado. A coleta publicada executa no GitHub Actions, com persistência no Cloudflare; veja [nuvem](docs/nuvem.md).

Para uma consulta única nacional/UF, sem iniciar a coleta contínua:

```powershell
node --experimental-strip-types scripts/collect.ts --once
```

Dados, logs e checkpoints ficam em `data/`, fora do futuro versionamento público. Não publicar credenciais. O repositório público foi criado; dados operacionais e credenciais ficam excluídos do Git.

## Verificar

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run stress
npm.cmd run validate:live
```

O teste de stress é sintético; seus resultados não demonstram precisão em eleições reais. O backtest aceita base, eventos cronológicos e verdade final:

```powershell
node --experimental-strip-types scripts/backtest.ts base.json eventos.ndjson verdade.json
```

Veja [método matemático](docs/metodo.md), [contratos da API](docs/api.md), [validação](docs/validacao.md), [fontes](docs/fontes.md) e [andamento](docs/progresso.md).

Correções da revisão integral: [relatório](docs/revisao-corrigida.md). A versão v2 usa um único ajuste nacional com agregação coerente por UF e município, fila durável de entrega e replay paginado completo.

## Limites de uso atual

- BUs e totais EA20 têm universos e horários próprios; nunca são escalados para forçar igualdade.
- Intervalos são nominais, sem probabilidade numérica de vitória.
- A projeção aparece somente quando há histórico correspondente e votos válidos observados.
- Definição matemática sobre o EA20 é distinta de previsão; exige vantagem superior a todo o eleitorado ainda não totalizado. Totalização encerrada é identificada separadamente.
- Autenticidade JWS usa chave oficial fixada do TSE. Isso não constitui verificação da cadeia X.509/LCR nem da assinatura interna de cada BU.
- Publicação e retomada em runners reais foram verificadas. Desligamento físico do PC e carga eleitoral completa não foram ensaiados; veja os limites em docs/nuvem.md.
