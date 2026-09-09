import { useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, MessageCircle, Send } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, FormActions, PageHeader, SelectField, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";

export function NewTicketPage() {
  const { data, user, repo, refresh } = useApp();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [categoryId, setCategoryId] = useState(data.categories.find((c) => c.isActive)?.id ?? "");
  const [priorityId, setPriorityId] = useState(
    data.priorities.find((item) => item.slug === "media" && item.isActive)?.id ??
      data.priorities.find((item) => item.isActive)?.id ??
      "",
  );
  const [unitId, setUnitId] = useState(user.unitId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 5) {
      showToast("O título precisa ter pelo menos 5 caracteres.", "error");
      return;
    }
    if (description.trim().length < 10) {
      showToast("Descreva o problema com pelo menos 10 caracteres.", "error");
      return;
    }
    setSaving(true);
    try {
      const ticket = await repo.createTicket({
        title,
        description,
        unitId,
        categoryId,
        priorityId,
      });
      await refresh();
      showToast(`Chamado #${ticket.number} criado com sucesso.`);
      navigate(`/chamados/${ticket.id}`);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível criar o chamado.",
        "error",
      );
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Atendimento / Novo chamado"
        title="Abrir novo chamado"
        description="Conte para a equipe o que está acontecendo. Campos marcados com * são obrigatórios."
      />
      <aside className="mb-6 rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:p-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-700">
          <BookOpen size={19} />
        </div>
        <h2 className="mt-5 font-display font-bold text-teal-950">Antes de enviar</h2>
        <ul className="mt-4 space-y-3 text-sm leading-5 text-teal-900/70">
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-700" /> Confira se a
            unidade está correta.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-700" /> Inclua mensagens de
            erro ou códigos.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-700" /> Não inclua senhas
            no chamado.
          </li>
        </ul>
        <div className="mt-6 border-t border-teal-200/60 pt-4 text-xs leading-5 text-teal-800/70">
          A equipe será avisada e você poderá acompanhar as respostas pela linha do tempo.
        </div>
      </aside>
      <form onSubmit={submit}>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft sm:p-7">
          <div className="mb-7 flex items-center gap-3 border-b border-slate-100 pb-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <MessageCircle size={19} />
            </span>
            <div>
              <h2 className="font-display font-bold text-ink">Sobre o problema</h2>
              <p className="text-xs text-slate-400">Quanto mais detalhes, mais rápida a solução.</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Solicitante"
              value={user.fullName}
              readOnly
              hint="Preenchido pelo seu perfil"
            />
            <TextField
              label="Telefone para contato"
              value={user.phone}
              readOnly
              hint="Edite no seu perfil"
            />
            <SelectField label="Unidade" value={unitId} onChange={setUnitId} required>
              {data.units
                .filter((u) => u.isActive)
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
            </SelectField>
            <SelectField label="Categoria" value={categoryId} onChange={setCategoryId} required>
              {data.categories
                .filter((c) => c.isActive)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </SelectField>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <SelectField label="Prioridade" value={priorityId} onChange={setPriorityId} required>
              {data.priorities
                .filter((p) => p.isActive)
                .map((priority) => (
                  <option key={priority.id} value={priority.id}>
                    {priority.name}
                  </option>
                ))}
            </SelectField>
            <div className="hidden sm:block" />
          </div>
          <div className="mt-5">
            <TextField
              label="Título do chamado"
              value={title}
              onChange={setTitle}
              placeholder="Ex.: Computador não liga"
              hint="Seja breve e objetivo (mínimo de 5 caracteres)"
            />
          </div>
          <div className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-ink">
              Descrição do problema<span className="ml-1 text-teal-700">*</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Explique o que aconteceu, quando começou e o que você já tentou..."
              aria-label="Descrição do problema"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <span className="mt-1.5 block text-xs text-slate-400">Mínimo de 10 caracteres</span>
          </div>
          <FormActions
            cancel={
              <Link to="/chamados" className="block">
                <Button type="button" variant="secondary" className="w-full">
                  Cancelar
                </Button>
              </Link>
            }
          >
            <Button loading={saving} className="w-full">
              Enviar chamado
              <Send size={16} />
            </Button>
          </FormActions>
        </div>
      </form>
    </>
  );
}
