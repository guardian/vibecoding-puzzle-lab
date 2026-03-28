import { ModelResponse } from "./models";

export enum ModelState {
    Ready = "ready",
    Thinking = "thinking",
    Error = "error",
    Query = "query",
}

export async function generateBundleFromCachedPrompt(bundleId: string): Promise<ModelResponse> {
    const initialPrompt = localStorage.getItem("temp-prompt-cache") ?? "";
    if (initialPrompt) {
        return generateBundleFromScratch(bundleId, initialPrompt);
    } else {
        throw new Error("No cached prompt found");
    }
}

export async function generateBundleFromScratch(bundleId: string, promptText: string): Promise<ModelResponse> {
    const modelResponse = await fetch(`/api/${bundleId}/prompt`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({ promptText }),
    });
    if (modelResponse.ok) {
        const parsedResponse = ModelResponse.safeParse(
            await modelResponse.json(),
        );
        if (parsedResponse.success) {
            return parsedResponse.data;
        } else {
            console.error(`Failed to parse model response:`, parsedResponse.error);
            throw new Error("Failed to parse model response");
        }
    } else {
        console.error(
            "Model generation request failed with status:",
            modelResponse.status,
        );
        throw new Error(`Model generation failed with status ${modelResponse.status}`);
    }
}