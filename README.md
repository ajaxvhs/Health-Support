# Health Support

Portal interno para abertura, acompanhamento e gestão de chamados de suporte.
Ele organiza solicitações, mensagens, prioridades, responsáveis, notificações e
auditoria em um único lugar.

## O que ele faz

- Permite que solicitantes criem e acompanhem chamados.
- Permite que a equipe visualize a fila de atendimento.
- Organiza chamados por status, prioridade, unidade e categoria.
- Permite atribuir, assumir, resolver e fechar chamados.
- Mantém conversas públicas e mensagens internas da equipe.
- Oferece área administrativa para usuários, catálogos e auditoria.
- Controla acesso com autenticação, perfis, permissões e políticas do Supabase.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase Auth, PostgreSQL, RLS e Edge Functions
- Vitest, ESLint e Prettier

## Requisitos

- Node.js
- npm
- Um projeto Supabase configurado

## Instalação

Clone o projeto e instale as dependências:

```bash
npm ci
```

Crie um arquivo `.env` na raiz a partir do exemplo:

```bash
cp .env.example .env
```

Preencha as variáveis do ambiente local:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
VITE_APP_URL=http://localhost:5173
```

A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser usada no navegador. Ela deve ficar
somente no ambiente protegido de uma Edge Function, quando necessário. As
migrations do banco ficam versionadas em `supabase/migrations` e devem ser
aplicadas somente ao ambiente apropriado.

## Desenvolvimento

Inicie o servidor local:

```bash
npm run dev
```

Depois acesse `http://localhost:5173`.

## Comandos úteis

```bash
npm run typecheck     # verifica os tipos TypeScript
npm test              # executa os testes
npm run lint          # verifica o código
npm run format:check  # verifica a formatação
npm run build         # gera a versão de produção
```

## Rotas principais

- `/entrar`: login
- `/`: painel inicial
- `/chamados`: lista e fila de chamados
- `/chamados/novo`: abertura de chamado
- `/chamados/:id`: detalhes e conversa do chamado
- `/fila`: atalho para a fila de atendimento
- `/admin/usuarios`: administração de usuários
- `/admin/catalogos`: categorias, unidades, prioridades e status
- `/admin/auditoria`: histórico de alterações
- `/perfil`: dados e senha do usuário

## Atualizações e deploy

As notificações Web Push usam a Vercel no frontend e Supabase serverless no
backend. O frontend lê a chave pública VAPID da configuração autenticada; a
chave privada, `service_role` e o segredo do dispatch ficam somente no ambiente
protegido da Edge Function. A configuração operacional detalhada permanece no
cofre local do projeto e não é publicada neste repositório.

O PWA avisa quando uma versão nova está pronta. O usuário deve salvar seu
trabalho antes de clicar em **Atualizar**; **Depois** mantém a versão atual.
O service worker novo aguarda confirmação antes de assumir as páginas.

Na Vercel, `vercel.json` configura revalidação do HTML e do service worker,
cache imutável dos assets com hash e exclui `/assets/` do fallback da SPA.
Falhas de módulos permitem uma recarga automática por aba a cada cinco minutos,
somente online, sem apagar caches ou a sessão. Erros persistentes exibem uma
tela com opção de tentar novamente.

A retenção de assets de deploys anteriores depende da hospedagem e não é
garantida por esses headers. Antes de publicar, validar com duas builds:
abrir a primeira, publicar a segunda, confirmar que o aviso aparece e que
**Depois** preserva o formulário; **Atualizar** deve abrir a versão nova.
Verificar também navegação offline e falha persistente de chunk sem loop.

## Segurança

- Arquivos `.env` não devem ser commitados.
- Chaves secretas não devem aparecer no frontend.
- A autorização deve ser aplicada no Supabase, não apenas na interface.
- Mudanças no banco devem ser registradas em migrations.
- Não inclua dados reais de usuários no código, README, issues ou commits.

## Estrutura

```text
src/pages       telas da aplicação
src/components  componentes reutilizáveis
src/router.tsx  proteção, redirecionamento e recuperação de rotas
src/lib         autenticação, regras, permissões e dados
src/context     estado compartilhado
supabase        schema, migrations e Edge Functions
tests           testes automatizados
```
