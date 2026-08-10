import { notFound } from "next/navigation";

/** /dev/* pages are verification-only and must not exist in production. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
