import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import { Button, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { executeAction } from "../../lib/actionRunner";
import { refreshAndNotify } from "../../lib/utils";
import type { CatalogItem, CatalogKind } from "../../types";

function parsePriorityLevel(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const level = Number(value);
  return Number.isSafeInteger(level) && level >= -2147483648 && level <= 2147483647 ? level : null;
}

export function CreateCatalogDialog({
  kind,
  priorityLevels = [],
  onClose,
  onCreate,
}: {
  kind: CatalogKind;
  priorityLevels?: number[];
  onClose: () => void;
  onCreate: (name: string, description: string, level?: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const isPriority = kind === "priorities";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      showToast("Informe um nome.", "error");
      return;
    }
    const priorityLevel = isPriority ? parsePriorityLevel(level) : undefined;
    if (priorityLevel === null) {
      showToast("Informe um nível de prioridade inteiro.", "error");
      return;
    }
    if (priorityLevel !== undefined && priorityLevels.includes(priorityLevel)) {
      showToast("Esse nível já está sendo usado por outra prioridade.", "error");
      return;
    }
    await executeAction(() => onCreate(name, description, priorityLevel ?? undefined), {
      fallback: "Não foi possível adicionar o item.",
      showToast,
      setPending: setSaving,
    });
  };
  const label = kind === "units" ? "unidade" : kind === "priorities" ? "prioridade" : "categoria";

  return (
    <Dialog
      title={isPriority ? "Nova prioridade" : "Novo item"}
      description={
        isPriority
          ? "Defina o nível usado para ordenar esta prioridade."
          : `Cadastre uma nova ${label} para os chamados.`
      }
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={submit}>
        <div className="mt-5">
          <TextField
            label="Nome"
            value={name}
            onChange={setName}
            placeholder={`Nome da ${label}`}
            required
          />
        </div>
        {isPriority && (
          <div className="mt-5">
            <TextField
              label="Nível de prioridade"
              type="number"
              inputMode="numeric"
              value={level}
              onChange={setLevel}
              hint="Use um número inteiro único. Números maiores aparecem primeiro."
              required
            />
          </div>
        )}
        {kind === "categories" && (
          <div className="mt-5">
            <TextField
              label="Descrição"
              value={description}
              onChange={setDescription}
              placeholder="Resumo exibido no catálogo"
            />
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            <Plus size={16} /> Criar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function EditCatalogDialog({
  item,
  kind,
  onClose,
}: {
  item: CatalogItem;
  kind: CatalogKind;
  onClose: () => void;
}) {
  const { data, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [level, setLevel] = useState(item.level?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const isPriority = kind === "priorities";
  const save = async () => {
    if (!name.trim()) {
      showToast("Informe um nome.", "error");
      return;
    }
    const priorityLevel = isPriority ? parsePriorityLevel(level) : undefined;
    if (priorityLevel === null) {
      showToast("Informe um nível de prioridade inteiro.", "error");
      return;
    }
    if (
      priorityLevel !== undefined &&
      data.priorities.some(
        (priority) => priority.id !== item.id && priority.level === priorityLevel,
      )
    ) {
      showToast("Esse nível já está sendo usado por outra prioridade.", "error");
      return;
    }
    const result = await executeAction(
      () => repo.renameCatalog(kind, item.id, name, description, priorityLevel ?? undefined),
      {
        fallback: "Não foi possível atualizar o item.",
        showToast,
        setPending: setSaving,
      },
    );
    if (!result.ok) return;
    onClose();
    await refreshAndNotify(refresh, showToast, "Item atualizado com sucesso.");
  };

  return (
    <Dialog
      title={isPriority ? "Editar prioridade" : "Editar item"}
      description={
        isPriority
          ? "Atualize o nome e o nível de ordenação da prioridade."
          : kind === "categories"
            ? "Atualize o nome e a descrição da categoria."
            : "Atualize o nome do item do catálogo."
      }
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="mt-5">
        <TextField label="Nome" value={name} onChange={setName} required />
      </div>
      {isPriority && (
        <div className="mt-5">
          <TextField
            label="Nível de prioridade"
            type="number"
            inputMode="numeric"
            value={level}
            onChange={setLevel}
            hint="Use um número inteiro único. Números maiores aparecem primeiro."
            required
          />
        </div>
      )}
      {kind === "categories" && (
        <div className="mt-5">
          <TextField
            label="Descrição"
            value={description}
            onChange={setDescription}
            placeholder="Resumo exibido no catálogo"
          />
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} loading={saving}>
          Salvar alterações
        </Button>
      </div>
    </Dialog>
  );
}
