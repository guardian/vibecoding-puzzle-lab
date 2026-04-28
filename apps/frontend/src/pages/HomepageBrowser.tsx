import { ExistingPuzzlesBrowser } from "../components/ExistingPuzzlesBrowser";
import { LoginFrame } from "../components/LoginFrame";
import { useState } from "react";
import { type PuzzleState } from "@puzzle-lab/common-lib";
import { useNavigate } from "react-router";
import { Button } from "@headlessui/react";

export function StateSelector() {
        const [showingState, setShowingState] = useState<PuzzleState>('visible');
        return (
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
        )
}

export function HomepageBrowser() {
    const nav = useNavigate();

    return <LoginFrame>
        <div className="p-4">
            <h1 className="mt-0 text-2xl font-semibold">What's cooking in the Lab?</h1>
            <p className="mb-4 flex items-center gap-2 text-slate-700">
                <span className="text-4xl">🧠</span><span>Want to make something new?</span>
                <Button onClick={()=>nav('/new')}
                    className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                    Start a new puzzle
                </Button>
            </p>

            <ExistingPuzzlesBrowser showingState="visible" pageSize={100}/>
        </div>
    </LoginFrame>
}