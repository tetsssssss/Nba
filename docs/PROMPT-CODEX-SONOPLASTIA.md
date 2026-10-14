# PROMPT PARA CODEX: INTEGRAR A SONOPLASTIA 01

Analise a versão principal do NBA Universe Manager antes de alterar qualquer coisa. Compare-a com o pacote Sonoplastia 01, implementado na base de referência com NBB, EuroLeague, EuroBasket, WNBA e fotos v2. Preserve por completo os prompts 01 e 09, saves, pós-temporada, carreira e todos os recursos próprios da versão principal.

Integre somente o sistema de áudio gerado no navegador (`src/audio/soundscape.js`), os controles nas partidas (`src/ui/views/match-live.js`), preferências locais (`src/core/settings.js`, `src/ui/views/settings.js`), Street espacial (`src/ui/components/street-spatial.js`), CSS, index e testes. Faça merge linha a linha nos arquivos com conflitos; não sobrescreva cegamente versões mais recentes. Se já houver áudio nativo, compare os sistemas e use adaptador ou escolha explicitamente o mais robusto.

Obrigatório: autoplay bloqueado até gesto do usuário; master/quadra/torcida ajustáveis; mute; cleanup ao sair; limite de sons em 8x; efeitos correspondendo a eventos reais de jogos; sem acesso ao IndexedDB ou escrita no save. Execute `npm test`, testes de interface em navegador quando possível, verifique áudio real com permissões do browser e apresente diff, métricas, resultados e limitações. Não declare como testado aquilo que não foi executado.
