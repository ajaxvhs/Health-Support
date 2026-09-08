import { LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";

export function AccessDeniedPage() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <LockKeyhole size={24} />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold text-ink">Acesso negado</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Seu perfil não tem permissão para acessar esta área.
      </p>
      <Link to="/">
        <Button className="mt-6">Voltar ao início</Button>
      </Link>
    </div>
  );
}
