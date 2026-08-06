import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import "./app.css";
import { TooltipProvider } from "~/core/components/ui/tooltip";
import { EvidenceUploadPanel } from "~/features/evidence/presentation/components/evidence-upload-panel";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    /*
      `TooltipProvider` di akar supaya seluruh tooltip berbagi satu pengatur
      jeda: begitu satu tooltip terbuka, tetangganya muncul seketika alih-alih
      menunggu jedanya sendiri-sendiri. Tanpa provider tooltipnya tetap jalan,
      tapi tiap satu berperilaku seolah yang pertama dibuka.
    */
    <TooltipProvider>
      <Outlet />
      {/*
        Panel progres unggahan bukti dukung dipasang di akar aplikasi, bukan di
        dalam halaman perpustakaannya: unggahan harus terus berjalan dan tetap
        terlihat saat pengguna berpindah halaman maupun berpindah lapis ruang
        kerja. Ia merender dirinya hanya ketika ada antrean unggahan.
      */}
      <EvidenceUploadPanel />
    </TooltipProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
