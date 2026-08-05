import type { PuzzleInfo, PuzzleState } from "@puzzle-lab/common-lib";
import { useEffect, useState } from "react";
import { loadIndexPage } from "../utils/api";
import { Button } from "@headlessui/react";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router";

function PuzzleCard({ puzzle }: { puzzle: PuzzleInfo }) {
    const nav = useNavigate();

    return (
        <article key={puzzle.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 mt-0 text-base font-semibold text-slate-900">{puzzle.name}</h2>
            <p className="my-1 text-sm text-slate-700"><strong>Author:</strong> {puzzle.author}</p>
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

export function ExistingPuzzlesBrowser({ showingState, pageSize }: { showingState: PuzzleState, pageSize: number }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [puzzles, setPuzzles] = useState<PuzzleInfo[]>([]);

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
        <>
            {loading && <p className="text-sm text-slate-600">Loading puzzles...</p>}
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            {!loading && !error && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {puzzles.map((puzzle) => <PuzzleCard key={puzzle.id} puzzle={puzzle} />)}
                </div>
            )}
        </>
    )
}