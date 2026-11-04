import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/jost/index.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
