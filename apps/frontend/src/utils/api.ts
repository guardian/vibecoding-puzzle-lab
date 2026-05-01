import { PuzzleIndexResponse, PuzzleInfo, type PuzzleState } from "@puzzle-lab/common-lib";
import type { PreviewError } from "../components/PreviewFrame";
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

export async function debugFault({
    bundleId,
    code,
    lastPreviewError,
    devServerLogs,
}: {
    bundleId: string;
    code: string;
    lastPreviewError: PreviewError | null;
    devServerLogs: string[];
}): Promise<ModelResponse> {
    const modelResponse = await fetch(`/api/${bundleId}/debug`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsx: code,
          lastError: lastPreviewError
            ? `${lastPreviewError.kind}: ${lastPreviewError.message}`
            : "No error information",
          containerLogs: devServerLogs.join("\n"),
        }),
      });
      if (modelResponse.ok) {
        const parsedResponse = ModelResponse.safeParse(
          await modelResponse.json(),
        );
        if (parsedResponse.success) {
          return parsedResponse.data;
        } else {
          console.error(
            "Failed to parse model response:",
            parsedResponse.error,
          );
          throw new Error(`Failed to parse model response`);
        }
      } else {
        throw new Error(`Model debug request failed with status: ${modelResponse.status}`);
      }
}

export async function loadIndexPage(state:PuzzleState, limit: number = 20, cursor: string | null = null): Promise<PuzzleIndexResponse> {
    const response = await fetch(`/api/index?state=${state}&limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`);
    if(response.ok) {
        return PuzzleIndexResponse.parse(await response.json());
    } else {
        console.error(`Failed to load index: ${response.status} ${await response.text()}`);
        throw new Error("Failed to load index");
    }
}

export async function loadPuzzleInfo(bundleId: string): Promise<PuzzleInfo | null> {
    const response = await fetch(`/api/bundle/${bundleId}/metadata`);
    if(response.ok) {
        return PuzzleInfo.parse(await response.json());
    } else if(response.status === 404) {
        return null;
    } else {
        console.error(`Failed to load puzzle info for ${bundleId}: ${response.status} ${await response.text()}`);
        throw new Error("Failed to load puzzle info");
    }
}

export async function updatePuzzleName(bundleId: string, newName: string): Promise<PuzzleInfo> {
    const response = await fetch(`/api/bundle/${bundleId}/metadata`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
    });

    if(!response.ok) {
        console.error(`Failed to update puzzle name for ${bundleId}: ${response.status} ${await response.text()}`);
        throw new Error("Failed to update puzzle name");
    }

    const responseBody = await response.json();
    const updatedInfo = responseBody?.updated;
    if(updatedInfo) {
        return PuzzleInfo.parse(updatedInfo);
    } else {
        console.error(`Unexpected response format when updating puzzle name for ${bundleId}:`, responseBody);
        throw new Error("Unexpected response format when updating puzzle name");
    }
}