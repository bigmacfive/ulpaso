import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./App.jsx";
import { I18nProvider } from "./I18n.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
      <Analytics />
    </I18nProvider>
  </React.StrictMode>,
);
