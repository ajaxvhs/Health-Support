import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, MessageCircle, Send } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, PageHeader, SelectField, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { errorMessage } from "../../lib/utils";
import {
  clearTicketDraft,
  readTicketDraft,
  saveTicketDraft,
  type TicketDraftFields,
} from "../../lib/ticketDraft";
import { markPwaFormsSaved } from "../../lib/pwaUpdate";

export function NewTicketPage() {
  const { data, user, repo, refreshTicketNavigationCounts } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [restoredDraft] = useState(() => readTicketDraft(user.id));
  const activeUnits = data.units.filter((unit) => unit.isActive);
  const activeCategories = data.categories.filter((category) => category.isActive);
  const activePriorities = data.priorities.filter((priority) => priority.isActive);
  const defaultUnitId =
    activeUnits.find((unit) => unit.id === user.unitId)?.id ?? activeUnits[0]?.id ?? "";
  const defaultCategoryId = activeCategories[0]?.id ?? "";
  const defaultPriorityId =
    activePriorities.find((item) => item.slug === "media")?.id ?? activePriorities[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(
    () =>
      activeCategories.find((category) => category.id === restoredDraft?.categoryId)?.id ??
      defaultCategoryId,
  );
  const [priorityId, setPriorityId] = useState(
    () =>
      activePriorities.find((item) => item.id === restoredDraft?.priorityId)?.id ??
      defaultPriorityId,
  );
  const [unitId, setUnitId] = useState(
    () => activeUnits.find((unit) => unit.id === restoredDraft?.unitId)?.id ?? defaultUnitId,
  );
  const [title, setTitle] = useState(restoredDraft?.title ?? "");
  const [description, setDescription] = useState(restoredDraft?.description ?? "");
  const [hasDraft, setHasDraft] = useState(Boolean(restoredDraft));
  const hasDraftChanges = useRef(Boolean(restoredDraft));
  const draftValues = useRef<TicketDraftFields>({
    title: restoredDraft?.title ?? "",
    description: restoredDraft?.description ?? "",
    unitId: activeUnits.find((unit) => unit.id === restoredDraft?.unitId)?.id ?? defaultUnitId,
    categoryId:
      activeCategories.find((category) => category.id === restoredDraft?.categoryId)?.id ??
      defaultCategoryId,
    priorityId:
      activePriorities.find((priority) => priority.id === restoredDraft?.priorityId)?.id ??
      defaultPriorityId,
  });
  const draftChanged = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (restoredDraft) showToast("Rascunho local restaurado.", "info");
  }, [restoredDraft, showToast]);

  const persistDraft = (releaseUpdate: boolean) => {
    if (!draftChanged.current && !hasDraftChanges.current) return false;
    const saved = saveTicketDraft(user.id, draftValues.current);
    if (saved) {
      setHasDraft(true);
      hasDraftChanges.current = true;
      if (releaseUpdate) {
        draftChanged.current = false;
        markPwaFormsSaved();
      }
    }
    return saved;
  };

  const updateDraftField = <K extends keyof TicketDraftFields>(
    key: K,
    value: TicketDraftFields[K],
  ) => {
    draftValues.current = { ...draftValues.current, [key]: value };
    draftChanged.current = true;
  };

  const persistOnBlur = () => {
    if (draftChanged.current) persistDraft(true);
    else if (hasDraftChanges.current) markPwaFormsSaved();
  };

  const discardDraft = () => {
    clearTicketDraft(user.id);
    draftValues.current = {
      title: "",
      description: "",
      unitId: defaultUnitId,
      categoryId: defaultCategoryId,
      priorityId: defaultPriorityId,
    };
    setTitle("");
    setDescription("");
    setUnitId(defaultUnitId);
    setCategoryId(defaultCategoryId);
    setPriorityId(defaultPriorityId);
    hasDraftChanges.current = false;
    draftChanged.current = false;
    setHasDraft(false);
    markPwaFormsSaved();
    showToast("Rascunho descartado.");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 5) {
      if (persistDraft(true)) draftChanged.current = false;
      showToast("O título precisa ter pelo menos 5 caracteres.", "error");
      return;
    }
    if (description.trim().length < 10) {
      if (persistDraft(true)) draftChanged.current = false;
      showToast("Descreva o problema com pelo menos 10 caracteres.", "error");
      return;
    }
    persistDraft(false);
    setSaving(true);
    try {
      const ticket = await repo.createTicket({
        title,
        description,
        unitId,
        categoryId,
        priorityId,
      });
      void queryClient.invalidateQueries({ queryKey: ["ticket-pages", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["audit-pages", user.id] });
      void refreshTicketNavigationCounts();
      clearTicketDraft(user.id);
      draftChanged.current = false;
      hasDraftChanges.current = false;
      setHasDraft(false);
      showToast(`Chamado #${ticket.number} criado com sucesso.`);
      navigate(`/chamados/${ticket.id}`);
    } catch (reason) {
      persistDraft(true);
      showToast(errorMessage(reason, "Não foi possível criar o chamado."), "error");
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
      <aside className="mb-6 rounded-2xl border border-brand-muted bg-brand-soft p-5 sm:p-7">
        <div className="lg:flex lg:items-center lg:gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand">
            <BookOpen size={19} />
          </div>
          <h2 className="mt-5 font-display font-bold text-brand-contrast lg:mt-0">
            Antes de enviar
          </h2>
        </div>
        <ul className="mt-5 space-y-3 border-t border-brand-border/60 pt-4 text-sm leading-5 text-brand-contrast/70 lg:grid lg:grid-cols-4 lg:gap-6 lg:space-y-0">
          <li className="flex gap-2 lg:justify-start lg:text-left">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" /> Confira se a unidade
            está correta.
          </li>
          <li className="flex gap-2 lg:justify-center lg:text-center">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" /> Descreva bem o
            problema.
          </li>
          <li className="flex gap-2 lg:justify-center lg:text-center">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" /> Informe quando o
            problema começou.
          </li>
          <li className="flex gap-2 lg:justify-end lg:text-right">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" /> Indique o que já foi
            tentado.
          </li>
        </ul>
      </aside>
      <form onSubmit={submit} onBlurCapture={persistOnBlur}>
        <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft sm:p-7">
          <div className="mb-7 flex items-center gap-3 border-b border-line-soft pb-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <MessageCircle size={19} />
            </span>
            <div>
              <h2 className="font-display font-bold text-ink">Sobre o problema</h2>
              <p className="text-xs text-subtle">Quanto mais detalhes, mais rápida a solução.</p>
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
            <SelectField
              label="Unidade"
              value={unitId}
              onChange={(value) => {
                setUnitId(value);
                updateDraftField("unitId", value);
                persistDraft(true);
              }}
              required
            >
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Categoria"
              value={categoryId}
              onChange={(value) => {
                setCategoryId(value);
                updateDraftField("categoryId", value);
                persistDraft(true);
              }}
              required
            >
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Prioridade"
              value={priorityId}
              onChange={(value) => {
                setPriorityId(value);
                updateDraftField("priorityId", value);
                persistDraft(true);
              }}
              required
            >
              {activePriorities.map((priority) => (
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
              onChange={(value) => {
                setTitle(value);
                updateDraftField("title", value);
              }}
              placeholder="Ex.: Computador não liga"
              hint="Seja breve e objetivo (mínimo de 5 caracteres)"
            />
          </div>
          <div className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-ink">
              Descrição do problema<span className="ml-1 text-brand">*</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                updateDraftField("description", e.target.value);
              }}
              rows={6}
              placeholder="Explique o que aconteceu, quando começou e o que você já tentou..."
              aria-label="Descrição do problema"
              className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-brand-focus focus:ring-2 focus:ring-brand-muted"
            />
            <span className="mt-1.5 block text-xs text-subtle">Mínimo de 10 caracteres</span>
          </div>
          <div className="mt-7 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-line-soft pt-5 md:grid-cols-[minmax(0,1fr),auto] md:items-center">
            <div className="order-1">
              {hasDraft && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full whitespace-nowrap md:w-auto"
                  onClick={discardDraft}
                >
                  Descartar rascunho
                </Button>
              )}
            </div>
            <p className="order-2 text-center text-xs text-subtle md:order-3 md:col-span-2 md:text-left">
              {hasDraft &&
                (draftChanged.current
                  ? "As alterações serão salvas ao sair do campo."
                  : "Rascunho salvo neste dispositivo. Ele será removido após o envio.")}
            </p>
            <div className="order-3 flex w-full flex-row gap-3 md:order-2 md:w-auto md:justify-end">
              <Link to="/chamados" className="block min-w-0 flex-1 md:w-auto md:flex-none">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full whitespace-nowrap md:w-auto"
                >
                  Cancelar
                </Button>
              </Link>
              <Button
                loading={saving}
                className="min-w-0 flex-1 whitespace-nowrap md:w-auto md:flex-none"
              >
                Enviar chamado
                <Send size={16} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
