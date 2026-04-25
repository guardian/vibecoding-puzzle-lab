import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuParameter, GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuCname } from "@guardian/cdk/lib/constructs/dns";
import { type App, Duration } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Cluster, ContainerImage, FargateTaskDefinition, LogDrivers, Protocol } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { GuCertificate } from "@guardian/cdk/lib/constructs/acm";
import { GuRole } from "@guardian/cdk/lib/constructs/iam";
import { PolicyDocument, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ApplicationProtocol } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { AttributeType, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import process from "node:process";
import { CognitoGatekeeper } from "./cognito-gatekeeper";

export class VibecodingPuzzlesLab extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const app = "vibecoding-puzzles-lab";
    const bedrockInferenceProfile = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";
    const bedrockModelId = "claude-sonnet-4-5-20250929-v1";

    const domainName = props.stage==="PROD" ? "puzzle-vibes.gutools.co.uk" : 
      `puzzle-vibes-${props.stage.toLowerCase()}.dev-gutools.co.uk`;
    
    const certificate = new GuCertificate(this, {
      app,
      domainName,
    });

    const buildNumber = process.env.BUILD_NUMBER ?? "DEV";

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

    new StringParameter(this, "IndexTableNameParam", {
      parameterName: `/${this.stage}/${this.stack}/${app}/indexTable`,
      stringValue: indexTable.tableName,
    });

    const bundlesBucket = new Bucket(this, "BundlesBucket", {
      bucketName: `puzzle-vibes-${this.stage.toLowerCase()}`,
      publicReadAccess: false,
      versioned: true,
    });

    new StringParameter(this, "BundlesBucketNameParam", {
      parameterName: `/${this.stage}/${this.stack}/${app}/s3_bucket`,
      stringValue: bundlesBucket.bucketName,
    });

    new StringParameter(this, "BedrockInferenceProfile", {
      parameterName: `/${this.stage}/${this.stack}/${app}/bedrock_model_id`,
      stringValue: bedrockInferenceProfile,
    });

    const vpcId = new GuParameter(this, "VpcId", {
      fromSSM: true,
      default: `/account/vpc/primary/id`,
      description: "The VPC to deploy the structuriser to"
    });

    const publicSubnetIds = new GuParameter(this, 'VpcPublicParam', {
			fromSSM: true,
			default: '/account/vpc/primary/subnets/public',
			type: 'List<String>',
		});

		const privateSubnetIds = new GuParameter(this, 'VpcPrivateParam', {
			fromSSM: true,
			default: '/account/vpc/primary/subnets/private',
			type: 'List<String>',
		});

		const availabilityZones = new GuParameter(this, 'VpcAZParam', {
			fromSSM: true,
			default: '/account/vpc/primary/availability-zones',
			type: 'List<String>',
		});

    const vpc = Vpc.fromVpcAttributes(this, 'Vpc', {
			vpcId: vpcId.valueAsString,
			publicSubnetIds: publicSubnetIds.valueAsList,
			privateSubnetIds: privateSubnetIds.valueAsList,
			availabilityZones: availabilityZones.valueAsList,
		});

    const cluster = new Cluster(this, "EcsCluster", {
      clusterName: `puzzle-lab-cluster-${this.stage}`,
      vpc,
      enableFargateCapacityProviders: true,
    });
    
    const taskRole = new GuRole(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      inlinePolicies: {
        // TODO: bedrock
        bucketAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["s3:GetObject", "s3:PutObject"],
              resources: [bundlesBucket.bucketArn + "/*"],
            }),
          ]
        }),
        dynamoAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"],
              resources: [indexTable.tableArn, `${indexTable.tableArn}/index/*`],
            }),
          ]
        }),
        configAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath","ssm:ListParameters"],
              resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stage}/${this.stack}/${app}/*`],
            }),
          ]
        }),
        bedrockAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["bedrock:InvokeModel"],
              resources: [
                `arn:aws:bedrock:${this.region}::model/${bedrockModelId}`, 
                `arn:aws:bedrock:${this.region}::inference-profile/${bedrockInferenceProfile}`
              ],
            }),
          ]
        }),
      }
    });

    const image = ContainerImage.fromEcrRepository(
      Repository.fromRepositoryAttributes(this, "EcrRepo", {
        repositoryName: "vibecoding-puzzle-builder",
        repositoryArn: `arn:aws:ecr:${this.region}:${this.account}:repository/vibecoding-puzzle-builder`
      }),
      buildNumber
    );

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      taskRole,
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    const container = taskDefinition.addContainer("webapp", {
      image,
      cpu: 512,
      memoryLimitMiB: 1024,
      readonlyRootFilesystem: true,
      logging: LogDrivers.awsLogs({ streamPrefix: "puzzle-lab" }),
      environment: {
        STAGE: this.stage,
        STACK: this.stack,
        AWS_REGION: this.region,
        APP: app,
      },
      portMappings: [{containerPort: 80, protocol: Protocol.TCP}]
    });

    taskDefinition.addVolume({
      name: "nginx-temp"
    });

    container.addMountPoints({
      containerPath: "/var/lib/nginx",
      sourceVolume: "nginx-temp",
      readOnly: false,
    });
    
    const svc = new ApplicationLoadBalancedFargateService(this, "Service", {
      certificate,
      serviceName: `puzzle-vibes-${this.stage}`,
      cluster,
      desiredCount: this.stage=="CODE" ? 2 : 4,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      publicLoadBalancer: true,
      taskDefinition,
      healthCheckGracePeriod: Duration.seconds(5),
      idleTimeout: Duration.minutes(1),
      protocol: ApplicationProtocol.HTTPS,
    });

    svc.targetGroup.configureHealthCheck({
      path: "/healthcheck",
      healthyHttpCodes: "200",
      interval: Duration.seconds(10),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2, //2 is the minimum allowed value here
      unhealthyThresholdCount: 5,
    });

    svc.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "30");

    const gatekeeper = new CognitoGatekeeper(this, "CognitoGatekeeper", {
      app,
      vpc,
      googleAuth: {
        domain: "gutools.co.uk",  //FIXME: check correct value
        allowedGroups: [""],
      }
    });
    
    gatekeeper.connectToALB(this, svc.loadBalancer, svc.listener, svc.targetGroup);

    new GuCname(this, 'EC2AppDns', {
      app,
      ttl: Duration.minutes(5), //while testing
      domainName,
      resourceRecord: svc.loadBalancer.loadBalancerDnsName,
    });
  }
}
