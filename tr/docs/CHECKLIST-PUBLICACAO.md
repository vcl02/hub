# Checklist de publicação manual

1. Rode `node scripts/check.mjs` e corrija qualquer falha. O GitHub Actions executa esse mesmo comando em cada `push` e `pull_request`, mas não substitui as conferências manuais abaixo.
2. Confira `git status` para não incluir alterações de outro trabalho.
3. Se houver migration nova, revise o SQL, obtenha confirmação explícita antes de aplicá-la no Supabase/DataGrip e valide o RLS antes de publicar. Confira o formato do DataGrip (sem `do $$`, sem `;` dentro de `$$` nem em comentário, `begin;`/`commit;`); depois de aplicada, confira o resultado com `SELECT`. Se o script abortar, rode `rollback;` antes de tentar de novo.
4. No celular, valide login, um exercício com séries marcadas (registro salvo), "Tudo salvo na nuvem" em Ajustes e o app abrindo sem internet.
5. Faça commit e envie para `origin/main`. Se o app estiver no GitHub Pages, o e-mail do Resend só é enviado quando o build do Pages retornar `built`; a configuração fica em `RESEND_API_KEY` (secret), `RESEND_FROM` e `RESEND_TO` (variables do repositório), nenhuma delas no Git.
