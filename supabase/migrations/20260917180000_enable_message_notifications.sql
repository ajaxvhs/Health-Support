drop trigger if exists ticket_messages_notification on public.ticket_messages;

create trigger ticket_messages_notification
after insert on public.ticket_messages for each row
execute function public.notify_ticket_message ();
