# Instalação no Chrome e fotos dos candidatos — 25/10/2026

Escopo solicitado: permitir instalar a página como app no Chrome com a identidade existente, incluir fotos nas molduras circulares e remover “O voto, em perspectiva.”. Alteração somente de interface/assets; modelo, coleta, banco, configurações e workflows preservados.

## Implementação

- Web App Manifest com ID/escopo/URL inicial na raiz, modo standalone, nome Vértice e ícones PNG 192/512. Favicon SVG e PNG usam as três barras inclinadas da marca existente.
- Botão “Instalar app” aparece quando o Chrome disponibiliza o evento nativo `beforeinstallprompt`; cada evento é consumido uma vez. O app instalado não oferece outra instalação. Instalação também disponível pelo menu nativo do Chrome conforme sua versão.
- Nenhum service worker ou cache offline foi introduzido. As consultas eleitorais continuam usando a rede; instalar o app não interrompe nem substitui a atualização dos dados.
- Retratos locais associados aos números oficiais 13 e 22 em modo live/replay. O ensaio sintético conserva A/B. Falha da imagem recupera a letra de identificação.
- Frase removida; “Painel de acompanhamento eleitoral” permanece como título acessível.

## Fontes e créditos

- Lula: foto individual `55450293419` do álbum fornecido, autor Ricardo Stuckert / Lula Oficial, licença CC BY-SA 4.0 declarada na página. URL: https://www.flickr.com/photos/lulaoficial/55450293419/in/album-72177720335035217 . Imagem: https://live.staticflickr.com/65535/55450293419_02f3d6abfa_w.jpg . Arquivo preservado como `public/photos/lula.jpg`; enquadramento circular por CSS. Créditos, fonte e licença no rodapé.
- Flávio: cópia integral do arquivo fornecido `flavio22-foto-flavio-web.webp`, preservado como `public/photos/flavio.webp`. O kit oficial https://www.flaviobolsonaro.com.br/materiais lista a versão WebP e opções PNG/PSD; foi mantida a versão otimizada para web fornecida pelo usuário. Não foi inventado crédito de fotógrafo.
- Chrome: requisitos consultados em https://web.dev/articles/install-criteria . O manifesto contempla os campos exigidos; o navegador decide a promoção de instalação considerando disponibilidade e engajamento.

O conector Firecrawl não suportou Flickr e não conseguiu recuperar o site de materiais. As duas fontes foram conferidas diretamente no Chrome. Nenhuma foto foi sintetizada ou retocada.

## Validação local

- `npm test`: 118 aprovados, zero falhas (`data/pwa-tests.log`), incluindo três cenários de instalação: evento consumido uma vez, app já instalado e falha com orientação de menu.
- `npm run build`: TypeScript/Vite aprovados (`data/pwa-build-final.log`).
- Chrome real em `http://127.0.0.1:4272/`: `Page.getInstallabilityErrors` retornou lista vazia; `Page.getAppManifest` sem erros e com os dois ícones. Botão de instalação disponibilizado pelo próprio evento do navegador.
- Ambas as fotos carregadas; recortes circulares conferidos visualmente. Frase ausente; título acessível preservado. Não foi instalada uma aplicação no Windows sem pedido do usuário.
- Revisão independente da interface: nenhum crítico; um achado de sobreposição do rodapé em janela estreita foi corrigido. Chrome a 800px reproduziu a sobreposição de 10px antes e confirmou separação de 4px depois. Viewport de teste restaurado; build refeito e aprovado. Não houve mudança no motor eleitoral.

Dry-run do Cloudflare aprovado (`data/pwa-dry-run.log`), nos mesmos Worker/D1 e sem mudança de bindings. Publicação e conferência externa serão registradas após o envio dos assets. Os coletores em execução não precisam ser reiniciados para esta mudança visual.

## Publicação confirmada

Código `4814e608ddc48685bcf79232e4bfb4d23043da0f` integrado em `main` e enviado. CI `40216140852` aprovado: 118 testes, build e auditoria sem vulnerabilidades. Worker publicado na versão `53c65e55-e8f7-4a94-bf42-dd32408a0b40`; versão anterior para rollback `d06d6592-1c84-446b-961d-a00c62f205a6`.

Conferência externa em `2026-10-25T17:24:12.662Z`: HTML, JavaScript, manifesto, ícones SVG/PNG e ambas as fotos responderam 200 e seus SHA-256 conferem com o build local. Modelo mantém o hash `f1835080b0161880fda5245692f356b711a7cdb35ed68da5c7a28a0cb6b41cbd`; estado `ok`. A fila observada de 291 itens é da coleta em andamento, que não foi reiniciada por esta publicação visual.

Chrome no endereço público: `Page.getInstallabilityErrors=[]`, manifesto válido com dois ícones e modo standalone, botão “Instalar app” visível, fotos carregadas e frase removida. O painel publicado foi mantido em uma aba do Chrome; a instalação efetiva no Windows fica para a ação do usuário. O servidor e a aba de pesquisa temporários foram encerrados. Evidência em `docs/evidencias/interface-app-producao.json` e logs locais `data/pwa-production-verified.log`.
