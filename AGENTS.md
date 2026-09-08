# Instrucoes para agentes

## Objetivo

Este projeto e um portal interno de suporte construido com React, TypeScript,
Vite, Tailwind CSS, Vitest e Supabase.

Antes de alterar codigo:

1. Leia o `README.md`, o `.env.example`, `SUPABASE_SETUP.md` e as notas do cofre
   em `~/Projetos/Cofre/Health Support` quando o trabalho envolver arquitetura,
   banco ou operacao.
2. Identifique a menor mudanca que resolve o pedido.
3. Verifique se a mudanca afeta autenticacao, permissoes, RLS, migrations,
   rotas ou dados persistidos.

## Seguranca

- Nunca leia, copie ou publique valores reais de `.env`.
- Nunca envie `SUPABASE_SERVICE_ROLE_KEY` para o navegador ou para o Git.
- Nao coloque senhas, tokens, dados pessoais ou identificadores de usuarios em
  notas, commits, issues ou README.
- O `.env`, `node_modules`, `dist` e `supabase/.temp` devem permanecer
  ignorados.
- Trate mudancas em RLS e Edge Functions como mudancas de seguranca: revise as
  policies e teste os cenarios permitidos e negados.

## Padrao de desenvolvimento

- Preserve a linguagem visual e a arquitetura existentes.
- Use nomes de rotas publicas em portugues; mantenha nomes de tabelas,
  colunas, funcoes e tipos internos somente quando a mudanca exigir migracao.
- Prefira mudancas pequenas e tipadas.
- Nao adicione compatibilidade retroativa sem necessidade concreta.
- Para dados novos no Supabase, crie migration versionada; nao edite somente o
  schema de referencia esperando que o remoto seja alterado.
- Para mudancas de comportamento, adicione ou atualize testes em `tests/`.
- Atualize as notas do cofre quando uma decisao de arquitetura, regra de
  negocio ou procedimento operacional mudar.

## Verificacao obrigatoria

Depois de alterar o projeto, execute:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

Se algum comando falhar, corrija a causa ou registre claramente o bloqueio.

## Git e publicacao

Antes do primeiro commit publico:

1. Confirme que `.env` e outros segredos estao ignorados.
2. Revise `git status` e `git diff --cached` antes de commitar.
3. Remova dados pessoais e referencias internas desnecessarias da documentacao.
4. Garanta que o README explique objetivo, setup, variaveis e comandos.
5. Execute todas as verificacoes obrigatorias.
6. Use uma mensagem de commit curta e descritiva.

Nunca faca push automatico para um repositorio publico sem confirmacao explicita
do proprietario.
