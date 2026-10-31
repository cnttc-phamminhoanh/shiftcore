import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import App from "./app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL || "/"}>
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <div style={{ padding: 24, color: "#b91c1c" }}>
            <p>Đã có lỗi hiển thị trang.</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(error)}</pre>
            <button onClick={resetErrorBoundary}>Tải lại</button>
          </div>
        )}
      >
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
