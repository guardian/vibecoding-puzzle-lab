import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import type { App } from "aws-cdk-lib";
import { AttributeType, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";

export class VibecodingPuzzlesLab extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const indexTable = new Table(this, "IndexTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: `puzzle-lab-index-${this.stage}`,
    });
    indexTable.addGlobalSecondaryIndex({
      indexName: "idxStateDate",
      partitionKey: {
        name: "state",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "lastModified",
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });
    indexTable.addGlobalSecondaryIndex({
      indexName: "idxAuthorDate",
      partitionKey: {
        name: "author",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "lastModified",
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    
  }
}
