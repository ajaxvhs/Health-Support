# Instrucoes para agentes

## Contexto

- E um app React 18 + TypeScript + Vite com Supabase Auth/Postgres/RLS/Realtime,
  Edge Functions, Tailwind, Vitest, ESLint e Prettier.
- O entrypoint e `src/main.tsx`; `src/router.tsx` define rotas lazy e protecao,
  `AppProvider` restaura a sessao, e `src/lib/repository.ts` concentra acesso a dados.
- Limites principais: `src/pages` telas, `src/components` componentes/layout,
  `src/lib` autenticacao/permissoes/regras/dados, `src/context` estado compartilhado,
  `supabase` schema/migrations/functions e `tests` testes de regras/utilitarios.
- Rotas novas devem seguir os nomes publicos em portugues.

## Seguranca e dados

- Consulte o cofre local em `~/Projetos/Cofre/Health Support` para arquitetura,
  regras de negocio e operacao; atualize a nota correspondente quando uma decisao
  reutilizavel mudar. Nunca copie para Git ou cofre valores reais de `.env`, secrets,
  tokens, dados pessoais ou identificadores operacionais desnecessarios.
- Para tarefas de frontend, consulte tambem `~/Projetos/Cofre/PREFERENCIAS - Website e desenvolvimento.md`.
- Ao resolver um problema com uma estrategia reutilizavel, registre problema,
  causa, solucao e verificacao em `~/Projetos/Cofre/Learning/05 - Solucoes`, sem
  incluir segredos ou dados especificos de usuarios.
- `VITE_*` pode chegar ao navegador; `SUPABASE_SERVICE_ROLE_KEY`, VAPID privado e
  `PUSH_DISPATCH_SECRET` ficam somente em ambiente protegido de servidor/funcao.
- A interface nao e uma barreira de seguranca: mudancas em autenticacao, papeis,
  permissoes ou dados exigem revisar tambem policies/RLS, triggers e Edge Functions.
- Mudancas de banco entram em migration versionada em `supabase/migrations`. O
  `supabase/schema.sql` e o bootstrap de referencia; migrations existentes podem
  pressupor que ele ja foi carregado.

## Comandos

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm test -- tests/auth.test.ts
npm run lint
npm run format:check
npm run build
```

- Para testar policies Web Push, carregue `supabase/schema.sql` e as migrations em
  um banco Supabase descartavel antes de executar `tests/pushPolicies.sql`; o script
  usa rollback e nunca deve rodar com credenciais de producao.
- Com o projeto Supabase vinculado, migrations usam `npx supabase db push`; a Edge
  Function usa `npx supabase functions deploy send-push --use-api`. Nao documente
  credenciais nesses comandos.

## Web Push e PWA

- Insercoes em `notifications` alimentam `push_queue`; `pg_net` dispara `send-push`
  imediatamente e o Cron de um minuto e fallback. A funcao reserva jobs com
  `service_role`; seu `verify_jwt` esta desabilitado, mas o endpoint exige o bearer
  `PUSH_DISPATCH_SECRET` e nunca deve ser chamado pelo frontend.
- Notas internas nao notificam solicitantes. Preserve as regras de destinatarios,
  RLS e auditoria ao alterar chamados, mensagens ou notificacoes.
- O PWA usa `registerType: "prompt"`: o novo service worker espera confirmacao do
  usuario. Preserve o comportamento de atualizar depois de salvar formularios e
  a denylist de `/assets/` ao alterar `vite.config.ts` ou `vercel.json`.

## Verificacao

- Mudancas de comportamento devem incluir ou atualizar testes em `tests/`.
- Antes de concluir, rode typecheck, testes, lint, format check e build; investigue
  falhas em vez de mascarar erros ou alterar configuracoes apenas para passar.

## Commits

- Siga o guia de commits em `~/Projetos/Cofre/Health Support/09 - Guia de commits.md`.
- Depois de cada commit, execute `git show --format=fuller --stat HEAD` e confira
  titulo, corpo, arquivos e verificacoes antes de continuar.
- Use quebras de linha reais no corpo da mensagem; nao passe `\\n` literal em
  argumentos `-m`.
- Se a mensagem ficar malformada, corrija o commit antes de criar o proximo.
