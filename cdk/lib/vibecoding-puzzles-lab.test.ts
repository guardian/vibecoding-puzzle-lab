import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { VibecodingPuzzlesLab } from "./vibecoding-puzzles-lab";

describe("The VibecodingPuzzlesLab stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new VibecodingPuzzlesLab(app, "VibecodingPuzzlesLab", { stack: "playground", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
