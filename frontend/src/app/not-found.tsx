import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <h2>Page not found</h2>
      <p>This page is no longer available.</p>
      <Link href="/">Return to applications</Link>
    </section>
  );
}
