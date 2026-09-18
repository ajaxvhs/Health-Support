# Notificações Web Push

## Arquitetura

O frontend permanece na Vercel. Supabase Postgres guarda inscrições e uma fila;
Supabase Cron chama a Edge Function `send-push` para enviar Web Push. Não há
servidor dedicado. O service worker exibe um aviso genérico e abre `/chamados`,
onde as rotas autenticadas e RLS continuam controlando o acesso.

Novos chamados avisam administradores e atendentes ativos, exceto o autor, com
nome do solicitante e número do chamado. Respostas usam o trigger existente
`notify_ticket_message`, que exclui o autor e informa quem respondeu e qual
chamado foi atualizado. Notas internas não são enviadas ao solicitante. A fila
revalida perfil ativo, troca obrigatória de senha e acesso ao chamado antes de
liberar o envio.

## Estado atual do backend (configurado via CLI em 2026-09-17)

- Migrations `20260917150000_web_push.sql` e `20260917160000_push_runtime_configuration.sql`
  aplicadas no banco remoto.
- Secrets da Edge Function configurados: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` e `PUSH_DISPATCH_SECRET`.
- Edge Function `send-push` publicada. POST sem o segredo retorna 401.
- Vault com `push_dispatch_url` e `push_dispatch_secret`; chave pública disponível em
  `push_public_config` para o frontend (sem necessidade de variável na Vercel).
- Cron `send-push-every-minute` agendado a cada minuto via `dispatch_push_queue()`.

## Passo restante: publicar o frontend

1. Publicar o frontend na Vercel com este código. A chave pública é lida de
   `push_public_config`; configurar `VITE_VAPID_PUBLIC_KEY` na Vercel é opcional.
   Nunca usar prefixo `VITE_` na chave privada ou no segredo do Cron.
2. O JWT segue desabilitado somente na função `send-push` porque ela exige
   `Authorization: Bearer <PUSH_DISPATCH_SECRET>`. Ela não aceita chamadas
   anônimas sem esse segredo nem chamadas diretas do frontend.

## Operação

- Cada chamada reserva até 10 entregas, com lease de cinco minutos e até cinco tentativas.
- Erros 404/410 removem inscrições expiradas. Outras falhas são tentadas novamente.
- Eventos com mais de um dia não são enviados. Monitorar e remover periodicamente
  linhas expiradas ou com cinco tentativas de `push_queue` usando acesso administrativo.
- A entrega é pelo menos uma vez: se a função cair depois de enviar e antes de
  confirmar no banco, pode haver repetição; a tag do navegador agrupa os avisos.
- A entrega depende da permissão, conexão, sistema operacional e serviço push.
- Logout desativa a inscrição do navegador antes de encerrar a sessão.
- Instalação e Web Push exigem HTTPS; o iPhone exige app na Tela de Início e iOS 16.4+.
- O agendamento, secrets, migration e publicação não são ativados por `npm run build`.

## Validação de aceite no ambiente de teste

O arquivo `tests/pushPolicies.sql` verifica isolamento entre duas contas,
inserção/exclusão pelo proprietário e bloqueio da fila/RPC para clientes autenticados.
Execute-o com `psql -v ON_ERROR_STOP=1 -f tests/pushPolicies.sql` conectado somente
a uma base de testes preparada com schema e migrations. O script usa rollback.

1. Usuário A deve conseguir criar/listar/remover somente suas inscrições; usuário B
   e acesso anônimo devem ser negados ao tentar alterá-las.
2. Nenhum cliente autenticado deve conseguir ler `push_queue` ou chamar `claim_push_jobs`.
3. POST sem segredo ou com segredo incorreto deve retornar 401 na função.
4. Criar um chamado: equipe recebe, autor não. Responder: destinatário recebe,
   autor não. Nota interna: solicitante não recebe.
5. Desativar perfil/remover acesso antes do processamento: nenhum envio permitido.
6. Rodar duas chamadas simultâneas: um job deve ser reservado por somente uma.
7. Simular 410 e falha transitória: inscrição removida no primeiro caso e retry no segundo.
8. Testar ativação negada, logout, troca de conta e desativação em cada dispositivo.
9. Com o app fechado, testar entrega e abertura do portal autenticado.
10. Abrir build A, publicar B, verificar o aviso de atualização e que adiar preserva
    o formulário. Atualizar e navegar após login. Simular chunk indisponível e
    desconexão: fallback amigável, sem loop ou limpeza geral de cache.

A suíte frontend não substitui estes testes de RLS, browser e entrega real.
