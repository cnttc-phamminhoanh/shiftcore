import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import App from "./app";
import "./index.css";

function ErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Đã có lỗi hiển thị.</p>
      <button onClick={resetErrorBoundary}>Thử lại</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/">
      <ErrorBoundary
        fallbackRender={({ resetErrorBoundary }) => (
          <ErrorFallback resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
