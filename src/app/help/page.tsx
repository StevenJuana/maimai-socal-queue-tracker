import { Navigation } from "@/components/Navigation";

export default function Help() {
  return (
    <main className="site-shell">
      <Navigation />
      <h1 className="page-title">Help</h1>
      <section className="panel">
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          If you have any questions, concerns, or recommendations about the app,
          feel free to contact me on Discord at <strong>bagelpog</strong>.
        </p>
        <p style={{ margin: 0 }}>Thanks for using the app!</p>
      </section>
    </main>
  );
}
