import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./context/ToastContext";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./index.css";
import { AppUpdateNotice } from "./components/AppUpdateNotice";
import { ThemeProvider } from "./context/ThemeProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
        <AppUpdateNotice />
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
