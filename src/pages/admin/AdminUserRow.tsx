import { CheckCircle2, Pencil, Power, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, CustomSelect } from "../../components/ui";
import { unitName } from "../../lib/selectors";
import { roleOptions, type AppData, type Profile, type Role } from "../../types";

export function AdminUserRow({
  profile,
  data,
  selected,
  onSelect,
  onEdit,
  onRoleChange,
  onToggle,
  onDelete,
  currentUserId,
}: {
  profile: Profile;
  data: AppData;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onRoleChange: (role: Role) => void;
  onToggle: () => void;
  onDelete: () => void;
  currentUserId: string;
}) {
  const protectedUser = profile.id === currentUserId;
  return (
    <div className="grid grid-cols-[36px_minmax(250px,1.55fr)_minmax(145px,1fr)_minmax(145px,0.9fr)_110px_minmax(275px,auto)] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0">
      <input
        type="checkbox"
        aria-label={`Selecionar ${profile.fullName}`}
        checked={selected}
        disabled={protectedUser}
        onChange={(event) => onSelect(event.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-teal-700 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar user={profile} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{profile.fullName}</p>
          <p className="truncate text-xs text-slate-500">@{profile.username}</p>
          <p className="truncate text-xs text-slate-400">{profile.email}</p>
        </div>
      </div>
      <span className="truncate text-center text-xs text-slate-500">
        {unitName(data, profile.unitId)}
      </span>
      <CustomSelect
        value={profile.role}
        onChange={(value) => onRoleChange(value as Role)}
        ariaLabel={`Perfil de ${profile.fullName}`}
        compact
        options={roleOptions}
      />
      <div className="flex justify-center">
        <Badge tone={profile.isActive ? "green" : "slate"} dot>
          {profile.isActive ? "Ativo" : "Inativo"}
        </Badge>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          title="Editar usuário"
          aria-label={`Editar ${profile.fullName}`}
          className="min-h-8 px-2 text-xs"
          onClick={onEdit}
        >
          <Pencil size={14} /> Editar
        </Button>
        <Button
          variant="ghost"
          disabled={protectedUser}
          title={protectedUser ? "Seu usuário não pode ser desativado" : undefined}
          aria-label={`${profile.isActive ? "Desativar" : "Ativar"} ${profile.fullName}`}
          className="min-h-8 px-2 text-xs"
          onClick={onToggle}
        >
          {profile.isActive ? <Power size={14} /> : <CheckCircle2 size={14} />}{" "}
          {profile.isActive ? "Desativar" : "Ativar"}
        </Button>
        <Button
          variant="danger"
          disabled={protectedUser}
          title={protectedUser ? "Seu usuário não pode ser excluído" : undefined}
          aria-label={`Excluir ${profile.fullName}`}
          className="min-h-8 px-2 text-xs"
          onClick={onDelete}
        >
          <Trash2 size={14} /> Excluir
        </Button>
      </div>
    </div>
  );
}
