import type { PuzzleInfo, PuzzleState } from "@puzzle-lab/common-lib";
import { useEffect, useState } from "react";
import { loadIndexPage } from "../utils/api";
import { LoginFrame } from "../components/LoginFrame";
import { Button } from "@headlessui/react";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router";

function PuzzleCard({ puzzle }: { puzzle: PuzzleInfo }) {
    const nav = useNavigate();

    return (
        <article key={puzzle.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 mt-0 text-base font-semibold text-slate-900">{puzzle.name}</h2>
            <p className="my-1 text-sm text-slate-700"><strong>ID:</strong> {puzzle.id}</p>
            <p className="my-1 text-sm text-slate-700"><strong>Author:</strong> {puzzle.author}</p>
            <p className="my-1 text-sm text-slate-700"><strong>Model:</strong> {puzzle.model}</p>
            <p className="my-1 text-sm text-slate-700"><strong>State:</strong> {puzzle.state}</p>
            <p className="my-1 text-sm text-slate-700"><strong>Last Modified:</strong> {puzzle.lastModified}</p>
            <p className="my-1 text-sm text-slate-700">
                <strong>Votes:</strong> +{puzzle.upvotes ?? 0} / -{puzzle.downvotes ?? 0}
            </p>
            <Button className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 w-full flex items-center justify-center" 
                onClick={() => nav(`/bundle/${puzzle.id}/editor`)}
            >
                <span>Open</span><ChevronRightIcon className="h-5 w-5"/>
                
            </Button>

        </article>
    )
}

export function ExistingPuzzlesBrowser() {
    const [showingState, setShowingState] = useState<PuzzleState>('visible');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [puzzles, setPuzzles] = useState<PuzzleInfo[]>([]);
    const pageSize = 100;

    useEffect(() => {
        let cancelled = false;

        async function loadPuzzles() {
            setPuzzles([]);
            setLoading(true);
            setError(null);
            try {
                const nextPage = await loadIndexPage(showingState, pageSize);
                if (!cancelled) {
                    setPuzzles(nextPage.bundles);
                }
            } catch (err) {
                console.error("Failed to load puzzle index:", err);
                if (!cancelled) {
                    setError("Failed to load puzzles");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadPuzzles();

        return () => {
            cancelled = true;
        };
    }, [showingState]);

    return (
        <LoginFrame>
            <div className="p-4">
                <h1 className="mt-0 text-2xl font-semibold">Existing Puzzles</h1>

                <div className="mb-4 flex items-center gap-2">
                    <label htmlFor="puzzle-state-filter" className="text-sm font-medium text-slate-700">State</label>
                    <select
                        id="puzzle-state-filter"
                        value={showingState}
                        onChange={(event) => setShowingState(event.target.value as PuzzleState)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    >
                        <option value="draft">draft</option>
                        <option value="visible">visible</option>
                        <option value="hidden">hidden</option>
                        <option value="replaced">replaced</option>
                        <option value="blocked">blocked</option>
                    </select>
                </div>

                {loading && <p className="text-sm text-slate-600">Loading puzzles...</p>}
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}

                {!loading && !error && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {puzzles.map((puzzle) => <PuzzleCard key={puzzle.id} puzzle={puzzle} />)}
                    </div>
                )}
            </div>
        </LoginFrame>
    )
}