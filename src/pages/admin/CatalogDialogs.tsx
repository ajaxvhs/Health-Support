import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import { Button, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import type { CatalogItem, CatalogKind } from "../../types";

export function CreateCatalogDialog({
  kind,
  onClose,
  onCreate,
}: {
  kind: CatalogKind;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      showToast("Informe um nome.", "error");
      return;
    }
    setSaving(true);
    try {
      await onCreate(name);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível adicionar o item.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const label = kind === "units" ? "unidade" : "categoria";

  return (
    <Dialog
      title="Novo item"
      description={`Cadastre uma nova ${label} para os chamados.`}
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
  const { repo, refresh } = useApp();
  const { showToast } = useToast();
  const [name, setName] = useState(item.name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) {
      showToast("Informe um nome.", "error");
      return;
    }
    setSaving(true);
    try {
      await repo.renameCatalog(kind, item.id, name);
      await refresh();
      showToast("Item atualizado com sucesso.");
      onClose();
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível atualizar o item.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Editar item"
      description="Atualize o nome do item do catálogo."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="mt-5">
        <TextField label="Nome" value={name} onChange={setName} required />
      </div>
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
