import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeBackendI18n } from "./i18n";
import "./styles.css";

initializeBackendI18n();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
