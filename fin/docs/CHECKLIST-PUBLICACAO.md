# Checklist de publicação manual

1. Rode `node scripts/check.mjs` e corrija qualquer falha. O GitHub Actions executa esse mesmo comando em cada `push` e `pull_request`, mas não substitui as conferências manuais abaixo.
2. Confira `git status` para não incluir alterações de outro trabalho.
3. Se houver migration nova, revise o SQL, obtenha confirmação explícita antes de aplicá-la no Supabase/DataGrip e valide RLS antes de publicar. Não aplique migrations apenas para testar a interface. Confira o formato do DataGrip (sem `do $$`, sem `;` dentro de `$$` nem em comentário, `begin;`/`commit;`), a prévia só de leitura e o teste partido em `;`; depois de aplicada, confira o resultado com `SELECT`. Se o script abortar, rode `rollback;` antes de tentar de novo.
4. No navegador, valide login, carga, um lançamento de débito, um lançamento de crédito com fatura, filtros e Reserva de emergência.
5. Confirme que simulações não aparecem no banco e que o download exporta somente o recorte filtrado.
6. Faça commit e envie para `origin/main`. O e-mail do Resend só é enviado quando o build nativo do GitHub Pages retornar `built` para o commit publicado. O `.nojekyll` mantém a publicação direta dos arquivos estáticos. A configuração fica em `RESEND_API_KEY` (secret), `RESEND_FROM` e `RESEND_TO` (variables do repositório); nenhuma delas pode entrar no Git.
