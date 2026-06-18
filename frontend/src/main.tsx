import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FiscalYearProvider } from "./context/FiscalYearContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FiscalYearProvider>
        <App />
      </FiscalYearProvider>
    </BrowserRouter>
  </React.StrictMode>
);
