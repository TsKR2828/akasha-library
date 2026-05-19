/* Script Workshop · v2 — Vite entry
   Loads data first, then mounts App. */

import React from "react";
import ReactDOM from "react-dom/client";
import App, { loadAllData } from "./App.jsx";
import "../tokens.css";

loadAllData().then(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}).catch(err => {
  console.error("Data load failed:", err);
  document.getElementById("root").innerHTML =
    '<div style="color:#c4604f;padding:40px;font-family:monospace">Data load error: ' + err.message + '</div>';
});
