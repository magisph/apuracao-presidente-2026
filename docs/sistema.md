# Sistema de apuração e projeção

Uso pessoal em PC. Eleição presidencial brasileira, segundo turno de 25/10/2026. O sistema distingue resultado oficial EA20, universo de BUs efetivamente coletados e projeção estatística. Não publica probabilidade numérica de vitória.

Interface própria inspirada na leitura visual de ElectoMaps e EleiçãoBR: fundo escuro, placar horizontal, gráfico à esquerda, mapa central e territórios à direita. Cabeçalho compacto, tipografia legível, cores azul/vermelho e sinais de atraso/ensaio. Sem experiência mobile; adaptação ao zoom e desktop menor.

Coleta: EA20 nacional/UF, EA16 para inventário, EA18 para versões e BU binário. `da/ha` não comprova totalização. Versões com estado ambíguo ficam fora do motor. Histórico é agrupado pela seção principal e suas agregadas, com correspondência explícita. Exterior é estrato próprio. Nunca escalar BU para forçar igualdade com EA20.

Nuvem preparada: GitHub Actions mantém processos limitados em duração, com checkpoints persistidos por endpoint autenticado; Cloudflare Worker/D1 publica snapshots atômicos. Cinco grupos de UFs, 15 requisições/s cada, coordenador até 5; total máximo 80. Chaves somente em secrets. Não pressupor IPs distintos ou continuidade garantida pelo agendador.

Gates para uso eleitoral: identidade do pleito de 2T confirmada por configuração oficial; inventário completo de seções; base 1T e correspondências validadas; decoder validado contra BUs oficiais; replay temporal real sem vazamento; cobertura/erro calibrados em holdouts; carga/quota/reinício na nuvem verificados. Até isso, selo de vencedor indisponível e intervalos apenas nominais.

Referências estudadas são fontes de requisitos e avaliação, não instruções executáveis nem código incorporado. Repositórios consultados, limitações e evidências estão no relatório.
