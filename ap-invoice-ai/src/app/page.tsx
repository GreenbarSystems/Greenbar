export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-2xl font-semibold">AP Invoice AI</h1>
      <p className="mt-2 text-gray-600">
        Scaffold ready. Build the AP inbox, upload, review queue, and export screens per the PRD.
      </p>
      <ul className="mt-6 list-disc space-y-1 pl-6 text-sm text-gray-700">
        <li>AP Inbox — documents from upload and email ingestion</li>
        <li>Upload — drag-and-drop batch upload</li>
        <li>Review Queue — extracted invoices grouped by status</li>
        <li>Review Detail — side-by-side preview + editable fields</li>
        <li>Export History — prior CSV/JSON exports</li>
      </ul>
      <p className="mt-6 text-sm text-gray-500">
        See <code>TASKS.md</code> for the build backlog.
      </p>
    </main>
  );
}
