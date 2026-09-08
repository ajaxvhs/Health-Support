import { useNavigate } from "react-router-dom";
import { useSession } from "../context/AppContext";
import { LoginPage } from "../pages/auth/LoginPage";

export function LoginRoute() {
  const { login } = useSession();
  const navigate = useNavigate();
  return (
    <LoginPage
      onLogin={async (profile) => {
        await login(profile);
        navigate(profile.mustChangePassword ? "/definir-senha" : "/", { replace: true });
      }}
    />
  );
}
