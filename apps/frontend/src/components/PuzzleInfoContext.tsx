import { createContext } from "react";
import { type PuzzleInfo } from "@puzzle-lab/common-lib";

export const PuzzleInfoContext = createContext<PuzzleInfo | null>(null);
