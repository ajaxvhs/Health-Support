import { CheckCircle2, Pencil, Power, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, CustomSelect } from "../../components/ui";
import { unitName } from "../../lib/selectors";
import { roleOptions, type AppData, type Profile, type Role } from "../../types";

type Props = {
  profile: Profile;
  data: AppData;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onRoleChange: (role: Role) => void;
  onToggle: () => void;
  onDelete: () => void;
  currentUserId: string;
};

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
}: Props) {
  const protectedUser = profile.id === currentUserId;
  const status = (
    <Badge tone={profile.isActive ? "green" : "slate"} dot>
      {profile.isActive ? "Ativo" : "Inativo"}
    </Badge>
  );
  const actions = (
    <>
      <Button
        variant="ghost"
        aria-label={`Editar ${profile.fullName}`}
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap bg-slate-50 px-1 py-2 text-[11px] md:min-h-8 md:flex-none md:bg-transparent md:px-2 md:py-0 md:text-xs"
        onClick={onEdit}
      >
        <Pencil size={14} /> Editar
      </Button>
      <Button
        variant="ghost"
        disabled={protectedUser}
        title={protectedUser ? "Seu usuário não pode ser desativado" : undefined}
        aria-label={`${profile.isActive ? "Desativar" : "Ativar"} ${profile.fullName}`}
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap bg-slate-50 px-1 py-2 text-[11px] md:min-h-8 md:flex-none md:bg-transparent md:px-2 md:py-0 md:text-xs"
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
        className="min-h-10 min-w-0 flex-1 flex-row gap-1 whitespace-nowrap px-1 py-2 text-[11px] md:min-h-8 md:flex-none md:flex-row md:px-2 md:py-0 md:text-xs"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Excluir
      </Button>
    </>
  );
  return (
    <div className="mx-3 my-3 rounded-2xl border border-slate-100 p-4 md:mx-0 md:my-0 md:grid md:grid-cols-[36px_minmax(250px,1.55fr)_minmax(145px,1fr)_minmax(145px,0.9fr)_110px_minmax(275px,auto)] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-b md:border-t-0 md:px-5 md:py-4">
      <div className="space-y-4 md:hidden">
        <div className="flex items-start gap-3">
          <Avatar user={profile} size="md" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold leading-5 text-ink">{profile.fullName}</p>
            <p className="mt-0.5 break-all text-xs text-slate-500">@{profile.username}</p>
            <div className="mt-2">{status}</div>
          </div>
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-50">
            <input
              type="checkbox"
              aria-label={`Selecionar ${profile.fullName}`}
              checked={selected}
              disabled={protectedUser}
              onChange={(event) => onSelect(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-teal-700 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
        </div>
        <div className="space-y-3 rounded-xl bg-slate-50/70 p-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              E-mail
            </span>
            <p className="mt-1 break-all text-xs leading-5 text-slate-600">
              {profile.email || "Não informado"}
            </p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Unidade
            </span>
            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-600">
              {unitName(data, profile.unitId)}
            </p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Perfil
            </span>
            <CustomSelect
              value={profile.role}
              onChange={(value) => onRoleChange(value as Role)}
              ariaLabel={`Perfil de ${profile.fullName}`}
              compact
              className="mt-1 [&>button]:min-h-11"
              options={roleOptions}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">{actions}</div>
      </div>
      <div className="hidden md:contents">
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
        <div className="flex justify-center">{status}</div>
        <div className="flex items-center justify-center gap-1">{actions}</div>
      </div>
    </div>
  );
}
