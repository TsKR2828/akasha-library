import React from "react";
import { createRoot } from "react-dom/client";
import SpreadsheetEditor from "./SpreadsheetEditor.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SpreadsheetEditor />
  </React.StrictMode>
);
