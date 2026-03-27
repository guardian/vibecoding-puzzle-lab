import { useNavigate } from "react-router";
import { useState } from "react";
function Index() {
  const nav = useNavigate();
  const [textContent, setTextContent] = useState("");

  const handleLetsDoIt = async () => {
    localStorage.setItem('temp-prompt-cache', textContent);
    const newUuid = crypto.randomUUID();
    nav(`/bundle/${newUuid}`);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <label htmlFor="prompt-input" className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-600">
          Build a new puzzle
        </label>
        <textarea
          id="prompt-input"
          name="prompt"
          placeholder="Describe what you want to build..."
          className="w-full min-h-[max(33vh,400px)] rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-200"
            value={textContent}
            onChange={(e)=>setTextContent(e.target.value)}
        />

        <button
          type="button"
          className="mt-4 block rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-200 mx-auto"
          onClick={handleLetsDoIt}
        >
          Let's do it!
        </button>
      </section>
    </main>
  )
}

export default Index
