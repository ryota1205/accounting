import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { FiscalYearProvider } from "./context/FiscalYearContext";
import { AlertsProvider } from "./context/AlertsContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FiscalYearProvider>
          <AlertsProvider>
            <App />
          </AlertsProvider>
        </FiscalYearProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
