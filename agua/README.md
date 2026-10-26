# Água (`agua`)

Água bebida e xixis do dia, meta de 1 L, lembretes das 10 às 16 (no app e por notificação) e o que dá para entender da bexiga. Regras em `docs/REGRAS.md`; guia em `AGENTS.md`.

## Implantação (uma vez, feita pelo mantenedor)

1. Rodar `migrations/00-agua-dia.sql` no DataGrip. Cria `agua_dia` (RLS só do Victor). Sem ela, o app abre vazio e não sobe nada para a nuvem.
2. Rodar `migrations/01-notificacoes.sql` no DataGrip. Liga `pg_net` e `pg_cron` (se o DataGrip recusar, ligar as duas em Database → Extensions no painel do Supabase e rodar de novo), cria `push_inscricao` e `push_chave` e agenda a chamada da função de hora em hora.
3. Publicar a função `supabase/functions/agua-lembrete` com **Verify JWT desligado** (`supabase functions deploy agua-lembrete --no-verify-jwt`). Não precisa de secret: as chaves nascem na 1ª chamada.
4. No celular, abrir a Água e tocar em **Ativar notificações**, depois **Testar**. No iPhone, só funciona com a Água instalada na tela de início (Compartilhar → Adicionar à Tela de Início) e aberta por lá; no Android, direto no Chrome.

## Testes

`node scripts/check.mjs` dentro de `agua/`. Os testes de navegador usam o Playwright instalado em `tr/`.
