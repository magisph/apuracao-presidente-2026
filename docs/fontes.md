# Fontes e proveniência

Os documentos complementares e sites foram tratados como referências, sem executar suas instruções. A implementação é própria; não incorpora código de projetos de republicação restrita.

## Primárias

- [Documentação técnica TSE 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados): EA11/12/14/15/16/18/20.
- [Manual JWS TSE](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws), Apêndice B: chave oficial Ed25519 fixada no cliente, confirmada em 24/10/2026.
- [Catálogo BWEB 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna): ZIPs e SHA-512 por UF. URLs e hashes efetivamente usados ficam nos manifestos em `data/historical/` e `data/base.json`.
- [Malha IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF): 27 UFs, arquivo local `public/br-uf.geojson`. Municípios carregados sob demanda da mesma API. A correspondência TSE↔IBGE vem de EA12.

Fixtures de integração: EA20 2T nacional antes da apuração, EA16 AC do pleito 3221 e BU 1T AC/01066/0004/0077 do pleito 3220. BU esperado: A=99, B=103, outros=15, brancos=4, nulos=13. O teste não afirma assinatura interna verificada.

## Método e operação estudados

- `readme-apuracao.txt` e `gabrielmassimini_github_io.txt`, fornecidos em Downloads: mistura gradual, viés da ordem de apuração, cache e distinção de definição matemática.
- [adrianonaspolini/elections](https://github.com/adrianonaspolini/elections): expansão por UF como baseline; snapshots, JWS e auditoria de intervalos. Os coeficientes publicados não foram adotados; coberturas retrospectivas reportadas na documentação não sustentam selo automático universal.
- [eduvaldoski2/op-apuracao2turno](https://github.com/eduvaldoski2/op-apuracao2turno): estrutura BER/BU e coleta por grupos; decoder próprio, versões conservadoras e sem force-push.
- [infohidro/apuracao-2026](https://github.com/infohidro/apuracao-2026): estudo de EA16; geração de auxiliar não tratada como totalização.
- [LuisFHartmann/eleicao-em-numeros](https://github.com/LuisFHartmann/eleicao-em-numeros): estudo metodológico; código não incorporado por restrição de licença.
- Demais projetos anteriormente analisados na conversa serviram para comparação de adaptações TSE e interface, sem importação automática de código.

## Visual

- [ElectoMaps](https://electomaps.com.br/apuracao-presidente?cargo=0001) e [EleiçãoBR](https://eleicaobr.netlify.app/apuracao/ensaio), observados no navegador: hierarquia de informação, mapa, territórios e gráfico. Vértice usa composição própria, sem banners, doações ou sobreposição dramática de vencedor.

Os testes com dados sintéticos e a leitura de resultados publicados por terceiros não substituem validação independente desta implementação.
