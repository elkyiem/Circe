import "@/styles/page.css";

import { createRoot } from "react-dom/client";
import { App } from "./app";

document.title = browser.runtime.getManifest().name;

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
