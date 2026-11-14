import "@/styles/page.css";

import { initScrollFade } from "@pond/ui/scroll-fade";
import { createRoot } from "react-dom/client";
import { App } from "./app";

document.title = browser.runtime.getManifest().name;

initScrollFade();
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
