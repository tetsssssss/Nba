# Fotografias NBB e EuroLeague, atualização v3 (09/10/2026)

## Contagem auditável

- Atletas no catálogo: **352**.
- Retratos com alguma URL: **63**.
- Retratos pesquisados e associados nominalmente: **56** (52 anteriores + 4 novos EuroLeague).
- Retratos legados NBA aproveitados que não receberam substituição: **7**.
- Faltam: **289**.
- NBB: **15/120** com foto.
- EuroLeague: **48/232** com foto.

## Notas de confiabilidade

- Foto vinculada significa que um URL de imagem identificado foi associado ao nome do atleta, não que os bytes foram baixados nem que o servidor permitirá exibição. **Disponibilidade e hotlink ainda não foram validados num navegador real**.
- Identidade nominal e equipe conferidas por pesquisa. As fotografias podem mostrar um uniforme de outra temporada, devidamente anotado quando identificado.
- O Google Imagens foi usado para localizar e conferir referências; o catálogo grava o URL da página ou da imagem hospedada na fonte identificada, nunca um thumbnail temporário do Google.
- NÃO se gerou fotografia artificial nem se preencheu jogador não identificado.
- Fotos não foram colocadas no ZIP como binários. A exibição necessita de conexão, e alguns hosts poderão negar pedidos.
- Os elencos referem-se à temporada de referência 2025/26 e não são promessa de transferências atualizadas para 2026/27.
- Nenhuma regra de jogo, Carreira, save ou playoffs foi alterada.

## Arquivos

- `src/international/verified-photos.json`: 56 referências pesquisadas.
- `docs/CATALOGO-FOTOS-NBB-EUROLEAGUE-v2.csv`: 352 atletas, status e fonte para auditoria.
- `tests/international-photos-v2.test.mjs`: testes novos de identidade, procedência e cobertura.

## Integração

O pacote completo é versão de referência a partir do FOTOS-v1. Para integração com a instalação privada, utilize somente as alterações de fotos e testes, sem substituir seus arquivos de Carreira. O patch parte exatamente do FOTOS-v1.
