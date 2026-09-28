import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./context/ToastContext";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./index.css";
import { AppUpdateNotice } from "./components/AppUpdateNotice";
import { ThemeProvider } from "./context/ThemeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <AppUpdateNotice />
        </QueryClientProvider>
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
