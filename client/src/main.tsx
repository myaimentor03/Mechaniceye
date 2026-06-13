import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import TestBackend from "./TestBackend";
import { toFrontendHref } from "./frontendRouting";

document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a") : null;
  const href = anchor?.getAttribute("href");

  if (
    !anchor ||
    !href?.startsWith("/") ||
    href.startsWith("//") ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  ) {
    return;
  }

  event.preventDefault();
  window.location.assign(toFrontendHref(href));
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TestBackend />
  </React.StrictMode>
);
