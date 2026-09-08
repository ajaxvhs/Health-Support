import { useContext } from "react";
import { ToastContext } from "./toast";

export function useToast() {
  return useContext(ToastContext);
}
