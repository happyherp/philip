// Entry point: mount the Preact app. The whole UI is built from components under
// frontend/ui/; the conversation logic, quote rendering and i18n live in the
// framework-agnostic modules they always did.
import { html, render } from "./frontend/vendor/preact.standalone.js";
import { App } from "./frontend/ui/app.js";

render(html`<${App} />`, document.getElementById("app"));
