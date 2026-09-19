import { useState } from "react";
import { BookOpen, CheckCircle2, Pencil, Plus, Power, Settings2, Trash2, Zap } from "lucide-react";
import {
  Badge,
  BulkActionButtons,
  Button,
  ConfirmDialog,
  PageHeader,
  TopSearch,
} from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import type { AppData, CatalogItem, CatalogKind } from "../../types";
import { CreateCatalogDialog, EditCatalogDialog } from "./CatalogDialogs";

type CatalogTab = CatalogKind;
type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  action: () => void;
} | null;

export function CatalogsPage() {
  const { data, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [tab, setTab] = useState<CatalogTab>("categories");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const items: CatalogItem[] = (tab === "units" ? data.units : data[tab]).filter(
    (item) =>
      !search ||
      `${item.name} ${item.code ?? ""} ${"description" in item ? (item.description ?? "") : ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const setTabAndClear = (value: CatalogTab) => {
    setTab(value);
    setSelected([]);
    setSearch("");
  };
  const finish = async (action: () => Promise<void>) => {
    try {
      await action();
      await refresh();
      setSelected([]);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível concluir a ação.",
        "error",
      );
    }
  };
  const bulkAction = (value: string) => {
    if (!value || !selected.length) return;
    const ids = [...selected];
    const deleting = value === "delete";
    setConfirm({
      title: deleting
        ? "Excluir itens selecionados"
        : value === "deactivate"
          ? "Desativar itens selecionados"
          : "Ativar itens selecionados",
      description: deleting
        ? "Itens referenciados serão desativados para preservar o histórico. Os demais poderão ser excluídos permanentemente."
        : "A alteração será aplicada a todos os itens selecionados. Deseja continuar?",
      confirmLabel: deleting
        ? "Excluir selecionados"
        : value === "deactivate"
          ? "Desativar selecionados"
          : "Ativar selecionados",
      variant: deleting ? "danger" : "primary",
      action: () =>
        finish(() =>
          deleting
            ? repo.bulkDeleteCatalog(tab, ids)
            : repo.bulkSetCatalogActive(tab, ids, value === "activate"),
        ),
    });
  };
  const createItem = async (itemName: string, description: string) => {
    if (tab !== "categories" && tab !== "units") return;
    await repo.addCatalog(tab, itemName, description);
    await refresh();
    showToast("Item adicionado ao catálogo.");
    setCreating(false);
  };
  const requestDelete = (item: CatalogItem) => {
    const referenced = isCatalogReferenced(data, tab, item);
    setConfirm({
      title: "Excluir item",
      description: referenced
        ? `${item.name} é usado por registros existentes e será desativado para preservar o histórico.`
        : `Excluir ${item.name} permanentemente? Essa ação não pode ser desfeita.`,
      confirmLabel: referenced ? "Desativar e preservar" : "Excluir permanentemente",
      variant: "danger",
      action: () =>
        finish(async () => {
          const result = await repo.deleteCatalog(tab, item.id);
          showToast(
            result === "deactivated"
              ? `${item.name} desativado para preservar o histórico.`
              : `${item.name} excluído.`,
          );
        }),
    });
  };
  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Catálogos"
        description="Mantenha as opções utilizadas na abertura dos chamados."
      />
      <div className="mb-6 rounded-2xl border border-line-soft bg-surface p-2 shadow-soft sm:p-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted/80 p-1 lg:grid-cols-4">
          {[
            { key: "categories", label: "Categorias", icon: Settings2 },
            { key: "units", label: "Unidades", icon: BookOpen },
            { key: "priorities", label: "Prioridades", icon: Zap },
            { key: "statuses", label: "Status", icon: CheckCircle2 },
          ].map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setTabAndClear(item.key as CatalogTab)}
              className={`flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${tab === item.key ? "bg-brand-strong text-on-brand shadow-sm" : "text-muted hover:bg-surface hover:text-ink"}`}
            >
              <item.icon size={17} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft">
        <div className="min-w-0 md:min-w-[950px]">
          <div className="flex flex-col gap-5 border-b border-line-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="font-display font-bold text-ink">
                {tab === "categories"
                  ? "Categorias de TI"
                  : tab === "units"
                    ? "Unidades de atendimento"
                    : tab === "priorities"
                      ? "Prioridades controladas"
                      : "Status do fluxo"}
              </h2>
              <p className="mt-1 text-xs text-subtle">{items.length} itens no catálogo</p>
            </div>
            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
              <TopSearch
                value={search}
                onSearch={setSearch}
                placeholder="Buscar no catálogo"
                className="w-full max-w-none sm:w-[32rem]"
              />
              <div className="flex items-center justify-between gap-4 sm:contents">
                <label className="flex min-h-10 items-center gap-2 px-1 text-xs font-semibold text-muted md:hidden">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os itens exibidos"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? selected.filter((id) => !items.some((item) => item.id === id))
                          : [...new Set([...selected, ...items.map((item) => item.id)])],
                      )
                    }
                    className="h-4 w-4 cursor-pointer rounded border-line-strong text-brand-strong focus:ring-brand-focus"
                  />
                  Selecionar todos
                </label>
                {(tab === "categories" || tab === "units") && (
                  <Button className="min-h-11" onClick={() => setCreating(true)}>
                    <Plus size={16} /> Novo item
                  </Button>
                )}
              </div>
              {selected.length > 0 && (
                <div className="flex w-full justify-center sm:w-auto">
                  <BulkActionButtons
                    onActivate={() => bulkAction("activate")}
                    onDeactivate={() => bulkAction("deactivate")}
                    onDelete={() => bulkAction("delete")}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="hidden grid-cols-[36px_minmax(280px,1fr)_120px_minmax(290px,auto)] gap-4 border-b border-line-soft bg-surface-soft/60 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-subtle md:grid md:px-7">
            <div className="flex items-center">
              <input
                type="checkbox"
                aria-label="Selecionar todos os itens exibidos"
                checked={allSelected}
                onChange={() =>
                  setSelected(
                    allSelected
                      ? selected.filter((id) => !items.some((item) => item.id === id))
                      : [...new Set([...selected, ...items.map((item) => item.id)])],
                  )
                }
                className="h-4 w-4 cursor-pointer rounded border-line-strong text-brand-strong focus:ring-brand-focus"
              />
            </div>
            <span>Item</span>
            <span className="text-center">Status</span>
            <span className="text-center">Ações</span>
          </div>
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              selected={selected.includes(item.id)}
              referenced={isCatalogReferenced(data, tab, item)}
              onSelect={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...new Set([...current, item.id])]
                    : current.filter((id) => id !== item.id),
                )
              }
              onEdit={() => setEditing(item)}
              onToggle={() =>
                setConfirm({
                  title: item.isActive ? "Desativar item" : "Ativar item",
                  description: item.isActive
                    ? `${item.name} não aparecerá em novos formulários. O histórico será preservado.`
                    : `${item.name} voltará a aparecer nas opções disponíveis.`,
                  confirmLabel: item.isActive ? "Desativar" : "Ativar",
                  action: () =>
                    finish(async () => {
                      await repo.setCatalogActive(tab, item.id, !item.isActive);
                      showToast(`${item.name} ${item.isActive ? "desativado" : "ativado"}.`);
                    }),
                })
              }
              onDelete={() => requestDelete(item)}
            />
          ))}
        </div>
      </section>
      {creating && (
        <CreateCatalogDialog kind={tab} onClose={() => setCreating(false)} onCreate={createItem} />
      )}
      {editing && <EditCatalogDialog item={editing} kind={tab} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? "Confirmar ação"}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          action?.();
        }}
      />
    </>
  );
}

function isCatalogReferenced(data: AppData, kind: CatalogTab, item: CatalogItem) {
  if (kind === "units")
    return (
      data.tickets.some((ticket) => ticket.unitId === item.id) ||
      data.profiles.some((profile) => profile.unitId === item.id)
    );
  if (kind === "categories") return data.tickets.some((ticket) => ticket.categoryId === item.id);
  if (kind === "priorities") return data.tickets.some((ticket) => ticket.priorityId === item.id);
  return data.tickets.some((ticket) => ticket.status === item.slug);
}

function CatalogRow({
  item,
  selected,
  referenced,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: CatalogItem;
  selected: boolean;
  referenced: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const status = (
    <Badge tone={item.isActive ? "green" : "slate"} dot>
      {item.isActive ? "Ativo" : "Inativo"}
    </Badge>
  );
  const mobileActions = (
    <div className="grid grid-cols-3 gap-2 border-t border-line-soft pt-3">
      <Button
        variant="ghost"
        aria-label={`Editar ${item.name}`}
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap bg-surface-soft px-1 py-2 text-[11px]"
        onClick={onEdit}
      >
        <Pencil size={14} /> Editar
      </Button>
      <Button
        variant="ghost"
        aria-label={`${item.isActive ? "Desativar" : "Ativar"} ${item.name}`}
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap bg-surface-soft px-1 py-2 text-[11px]"
        onClick={onToggle}
      >
        {item.isActive ? <Power size={14} /> : <CheckCircle2 size={14} />}{" "}
        {item.isActive ? "Desativar" : "Ativar"}
      </Button>
      <Button
        variant="danger"
        aria-label={`Excluir ${item.name}`}
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap px-1 py-2 text-[11px]"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Excluir
      </Button>
    </div>
  );
  return (
    <div className="mx-3 my-3 rounded-2xl border border-line-soft p-4 md:mx-0 md:my-0 md:grid md:grid-cols-[36px_minmax(280px,1fr)_120px_minmax(290px,auto)] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-b md:border-t-0 md:px-5 md:py-4">
      <div className="space-y-4 md:hidden">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xs font-bold text-brand-strong">
            {item.code ? item.code.slice(0, 2) : <Settings2 size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold leading-5 text-ink">{item.name}</p>
            <div className="mt-2">{status}</div>
          </div>
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-soft">
            <input
              type="checkbox"
              aria-label={`Selecionar ${item.name}`}
              checked={selected}
              onChange={(event) => onSelect(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-line-strong text-brand-strong focus:ring-brand-focus"
            />
          </label>
        </div>
        <div className="min-w-0 rounded-xl bg-surface-soft/70 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            Descrição
          </span>
          <p className="mt-1 break-words text-xs leading-5 text-secondary">
            {item.description ?? item.code ?? "Disponível no formulário de chamados"}
          </p>
        </div>
        {mobileActions}
      </div>
      <div className="hidden md:contents">
        <input
          type="checkbox"
          aria-label={`Selecionar ${item.name}`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-line-strong text-brand-strong focus:ring-brand-focus"
        />
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xs font-bold text-brand-strong">
            {item.code ? item.code.slice(0, 2) : <Settings2 size={16} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{item.name}</p>
            <p className="truncate text-xs text-subtle">
              {item.description ?? item.code ?? "Disponível no formulário de chamados"}
            </p>
          </div>
        </div>
        <div className="flex justify-center">
          <Badge tone={item.isActive ? "green" : "slate"} dot>
            {item.isActive ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            aria-label={`Editar ${item.name}`}
            title="Editar item"
            className="min-h-8 px-2 text-xs"
            onClick={onEdit}
          >
            <Pencil size={14} /> Editar
          </Button>
          <Button
            variant="ghost"
            aria-label={`${item.isActive ? "Desativar" : "Ativar"} ${item.name}`}
            className="min-h-8 px-2 text-xs"
            onClick={onToggle}
          >
            {item.isActive ? <Power size={14} /> : <CheckCircle2 size={14} />}{" "}
            {item.isActive ? "Desativar" : "Ativar"}
          </Button>
          <Button
            variant="danger"
            aria-label={`Excluir ${item.name}`}
            title={
              item.isActive && referenced ? "Será desativado para preservar o histórico" : undefined
            }
            className="min-h-8 px-2 text-xs"
            onClick={onDelete}
          >
            <Trash2 size={14} /> Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}
