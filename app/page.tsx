// Minimal landing page — confirms the server is running.
// The real product is the API consumed by the mobile app.
export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '600px' }}>
      <h1>Tazkia AI Assistant</h1>
      <p>Islamic Knowledge RAG API is running.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><a href="/api/health">GET /api/health</a></li>
        <li><a href="/api/sources">GET /api/sources</a></li>
        <li>POST /api/ask — SSE streaming</li>
        <li>POST /api/search — paginated search</li>
      </ul>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>
        See README.md for full API documentation.
      </p>
    </main>
  );
}
