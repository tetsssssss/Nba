# NBB e EuroLeague: catalogação de fotografias

**Estado verificado em 8 de outubro de 2026:** 352 nomes cadastrados na base internacional (120 NBB, 232 EuroLeague). Agora 25 possuem URL de foto identificada (11 URLs individuais revisadas por pesquisa; 14 retratos públicos da NBA já incluídos). Permanecem **327 sem imagem individual validada**. Há clubes NBB sem elenco cadastrado, que precisam de uma etapa de levantamento nominal separada.

Não confundir **URL identificada** com imagem embutida, nem foto remota com disponibilidade garantida. O ambiente de testes não conseguiu baixar os arquivos dos sites externos. Alguns links podem mudar, bloquear hotlink ou exigir autorização do detentor dos direitos. Retratos ficam hospedados nas suas fontes, não redistribuídos no ZIP. Nenhuma foto foi extraída de banco pago (Getty/Shutterstock).

## O que já está disponível no simulador

- A aba **Fotos** nas telas NBB e EuroLeague, com lista pesquisável, filtro pendentes/com foto, contagem de cobertura, pesquisa específica no Google Imagens, campo de URL HTTPS, aplicação e remoção de fotos.
- Fontes de imagens registradas em `src/international/verified-photos.json`, por chave `ID_DA_EQUIPE:NOME_DO_ATLETA`. Isto reduz atribuição errada em caso de homônimo.
- Precedência: foto escolhida pelo usuário, foto catalogada, retrato NBA existente e, finalmente, iniciais. URLs inseguras são rejeitadas.
- Catálogo particular em `localStorage` sob a chave `nba-universe:int-photo-overrides:v1`, isolado de saves e Carreira NBA. É possível exportar/importar JSON na própria tela.
- A planilha `AUDITORIA-FOTOS-NBB-EUROLEAGUE.csv`, com 352 linhas e atalhos de pesquisa individuais, destinada à identificação futura, auditoria ou trabalho assistido no Codex.

## Fluxo para completar as 327 imagens restantes

1. Abra a aba Fotos da NBB ou EuroLeague e mantenha o filtro **Sem foto**.
2. Clique em **Google Imagens** para o atleta desejado, conferindo nome, equipe e aparência com fonte nominal confiável (LNB, EuroLeague ou clube).
3. Copie o URL HTTPS **direto do arquivo de imagem**, não a página de resultados. Cole em **Aplicar foto**.
4. Salve o catálogo pelo botão **Exportar catálogo JSON** e copie o texto para seu arquivo externo. O link remoto pode quebrar posteriormente; a auditoria deve continuar.
5. Para integrar permanentemente ao código, revise a foto e a fonte, e adicione em `verified-photos.json`, sob o ID exato do atleta.

## Fontes consultadas

- Lista e perfis oficiais da Liga Nacional de Basquete: https://lnb.com.br/nbb/atletas
- Perfis e fotos da EuroLeague: https://www.euroleaguebasketball.net/euroleague/players/
- Elencos e imagens oficiais de clubes (FC Barcelona, Real Madrid e AS Monaco)
- Fontes de imprensa com atletas identificados (MundoBola, Itatiaia e Naiz)

Atributos individuais presentes no jogo ainda são estimativas de design. A adição das fotos não altera habilidades, estatísticas nem resultados das partidas.
