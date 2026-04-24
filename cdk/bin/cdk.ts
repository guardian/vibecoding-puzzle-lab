import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { VibecodingPuzzlesLab } from "../lib/vibecoding-puzzles-lab";

const app = new GuRoot();
new VibecodingPuzzlesLab(app, "VibecodingPuzzlesLab-euwest-1-CODE", { stack: "playground", stage: "CODE", env: { region: "eu-west-1" } });
new VibecodingPuzzlesLab(app, "VibecodingPuzzlesLab-euwest-1-PROD", { stack: "playground", stage: "PROD", env: { region: "eu-west-1" } });
