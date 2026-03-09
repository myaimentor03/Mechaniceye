import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import TestBackend from "./TestBackend";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TestBackend />
  </React.StrictMode>
);
