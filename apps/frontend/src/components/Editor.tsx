import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { useEffect, useMemo, useState } from "react";

interface EditorProps {
    code: string;
    onChange: (value: string) => void;
    wrapLines: boolean;
    readOnly: boolean;
}

export function Editor ({code, onChange, wrapLines, readOnly}:EditorProps) {
    const [internalView, setInternalView] = useState<string>(code);

    const extensions = useMemo(() => [javascript({ jsx: true })], []);
    
    useEffect(()=>{
        const timerId = setTimeout(()=>onChange(internalView), 500); //debounce changes to avoid excessive updates
        return () => clearTimeout(timerId);
    }, [internalView]);

    useEffect(()=>{
        if(code !== internalView) {
            setInternalView(code); //if the code prop changes from outside, update the internal view
        }
    }, [code]);

    return (
        <CodeMirror
          value={code}
          height="100%"
          className={wrapLines ? "cm-wrap-lines" : undefined}
          extensions={extensions}
          readOnly={readOnly}
          onChange={(text)=>setInternalView(text)}
        />
    )
}