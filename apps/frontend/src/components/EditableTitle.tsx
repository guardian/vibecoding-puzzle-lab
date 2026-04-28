import { Button } from "@headlessui/react";
import { CheckIcon, PencilSquareIcon } from "@heroicons/react/24/solid";
import { useState } from "react";

export function EditableTitle({title, onTitleChange}: {title: string, onTitleChange: (newTitle: string) => void}) {
    const [editing, setEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState(title);

    const handleBlur = () => {
        setEditing(false);
        onTitleChange(draftTitle);
    }

    return (
        <div className="flex items-center gap-2">
            {editing ? (
                <input 
                    autoFocus
                    value={draftTitle} 
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleBlur();
                        }
                    }}
                    className="text-2xl font-bold border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
            ) : (
                <h1 className="text-2xl font-bold" onClick={() => setEditing(true)}>
                    {title || "Untitled Puzzle"}
                </h1>
            )}
            {
                editing ? (
                    <Button onClick={() => setEditing(true)} className="text-sm text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                        <CheckIcon className="h-4 w-4"/>
                        <span className="sr-only">Edit title</span>
                    </Button>
                ) : (
                <Button onClick={() => setEditing(true)} className="text-sm text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                    <PencilSquareIcon className="h-4 w-4"/>
                    <span className="sr-only">Edit title</span>
                </Button>
                )
            }
         </div>
    )
}
