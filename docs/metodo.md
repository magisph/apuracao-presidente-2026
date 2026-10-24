# Método v2 — ajuste hierárquico único e agregação coerente

## Universo e denominadores

Cada unidade é a seção principal atual com todas as agregadas identificadas. `electorate` é o eleitorado dessa unidade; `firstA/firstB/firstOther/firstValid` são votos 1T agrupados por correspondência verificada. Candidatos A/B são números oficiais configurados, nunca nomes inferidos. `firstA+firstB+firstOther=firstValid`. Votos observados devem satisfazer A+B=valid e valid+blank+null=turnout <= electorate. Percentuais projetados têm denominador votos válidos projetados. Progresso de mistura usa eleitorado das unidades observadas / eleitorado do universo, não número de urnas.

Sem histórico verificado: unidade excluída do universo modelado e cobertura perdida explicitada. Não há expansão silenciosa dessa cobertura para o país. Ausência de observações: projeção indisponível, sem prior apresentado como apuração. Oficial EA20 permanece independente.

Eleitorado individual desconhecido é `null`, permitido somente em unidade sem correspondência; não se converte em eleitorado zero. O inventário 2T contém 42 unidades do exterior sem BU1T correspondente. O denominador nacional/UF de cobertura usa EA20/EA14 quando disponível; o numerador é referência 1T provisória. Os números absolutos de unidades com/sem histórico são mostrados. O eleitorado do BU atual é validado internamente (comparecimento ≤ eleitorado) e não precisa ser idêntico ao histórico. Diferenças são registradas sem substituir a referência congelada ou descartar votos somente por mudança entre turnos. Identidade e contagens inconsistentes continuam rejeitadas.

## Transferência líquida T

Por estrato UF×capital/interior (ZZ exterior), estimar p pela regressão de mínimos quadrados regularizada de `A_2T/valid_2T - A_1T/valid_1T = p * other_1T/valid_1T`. Peso é valid_2T. Prior p=0,5, força 2000 votos equivalentes; estima-se primeiro BR e depois estrato com prior nacional. p limitado [0,1]. Não é uma estimativa causal de transferência individual, apenas parametrização líquida. Se há migração entre finalistas, o modelo de swing oferece alternativa.

## Swing H

Perfil histórico q=(firstA+0,5*firstOther)/firstValid com clipping [0,005;0,995]. Para unidades observadas, delta=logit((A+0,5)/(valid+1))-logit(q). Média ponderada por valid com regularização BR→região→UF→município. Cada nível acrescenta força 2000 ao prior do pai; nacional tem prior zero e força 2000. Na unidade restante, qH=logistic(logit(q)+delta_mun).

## Participação, mistura e total

Taxa de votos válidos por eleitor do 1T ajustada pela razão observada 2T/1T. Razão nacional e estrato regularizadas com força 2000 eleitores; taxa prevista limitada [0,1]. Cada unidade restante tem valid estimado=electorate * taxa1T * razão_estrato.

w=clip((eleitorado_observado/eleitorado_total - 0,05)/0,10;0;1). q=(1-w)*qT+w*qH. Total A = A observado + soma(valid restante*q); B análogo. Quando todas as unidades estão observadas o resultado é exatamente a soma coletada. Modelos T/H e baseline proporcional por UF são diagnósticos.

O ajuste é nacional e realizado uma única vez por versão. Cada unidade restante recebe uma previsão; os votos previstos e observados são somados para UF, município e Brasil. Territórios sem BUs locais podem receber previsão pela hierarquia, mantendo zero observações e progresso local zero. Não há um novo ajuste independente por território. Diferenças inferiores a um milésimo de voto em somas nacionais podem decorrer da ordem das operações de ponto flutuante.

## Intervalo nominal e estabilidade

Bootstrap por municípios dos resíduos observados em escala logit, com semente fixa, componente nacional comum e componente de UF correlacionado entre seções. 400 réplicas por padrão (configurável até 2000). Incerteza de partida 0,20 logit, sem afirmar calibração. Usar quantis 2,5/97,5 da parcela A. B é complemento invertido. Intervalo colapsa com universo totalmente observado. Amostras artificiais não demonstram cobertura real.

Selo estatístico desabilitado nesta versão até validação independente de cobertura e regra de decisão. Probabilidade de vitória não calculada. A matemática de definição oficial usa limite de votos restantes informado e verificado, não projeção.

Os mesmos sorteios por unidade formam as distribuições nacionais e territoriais. Quantis não são somáveis; a coerência é dos votos de cada réplica e das estimativas pontuais. As perturbações 0,20 continuam nominais, sem parâmetro calibrado inferido a partir do teste do Acre.

## Avaliação

Replay aceita uma sequência ordenada de versões, aplica apenas registros disponíveis até cada instante e mede erro médio/máximo, cobertura nominal, largura e tempo. Ordens sintéticas (capital primeiro, interior primeiro, aleatória) têm rótulo explícito. Parâmetros devem ser ajustados em treino, com eleição/período reservado como holdout. Não escolher parâmetros após olhar o teste e chamá-lo independente.
