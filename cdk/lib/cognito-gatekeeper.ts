// This is lifted wholesale from https://github.com/guardian/cdk/blob/main/src/patterns/ec2-app/base.ts
// where it is part of the Ec2AppBase pattern. We have lifted it out into a standalone construct so we
// can use the same ALB auth against ECS.

import { NAMED_SSM_PARAMETER_PATHS } from "@guardian/cdk/lib/constants";
import type { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuHttpsEgressSecurityGroup } from "@guardian/cdk/lib/constructs/ec2";
import { GuLambdaFunction } from "@guardian/cdk/lib/constructs/lambda";
import { getUserPoolDomainPrefix } from "@guardian/cdk/lib/utils/cognito/cognito";
import { Duration, SecretValue, Tags } from "aws-cdk-lib";
import {
  ProviderAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
  UserPoolIdentityProviderGoogle,
} from "aws-cdk-lib/aws-cognito";
import type { IVpc } from "aws-cdk-lib/aws-ec2";
import type {
  ApplicationListener,
  ApplicationLoadBalancer,
  IApplicationTargetGroup,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ListenerAction } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { AuthenticateCognitoAction } from "aws-cdk-lib/aws-elasticloadbalancingv2-actions";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

interface GoogleAuthProps {
  domain: string;
  allowedGroups?: string[];
  sessionTimeoutInMinutes?: number;
  credentialsSecretsManagerPath?: string;
  cognitoAuthStage?: string;
}

export interface CognitoGatekeeperProps {
  app: string;
  vpc: IVpc;
  googleAuth: GoogleAuthProps;
}

export class CognitoGatekeeper extends Construct {
  readonly vpc: IVpc;
  readonly app: string
  readonly userPoolClient: UserPoolClient;
  readonly userPoolDomain: UserPoolDomain;
  readonly userPool: UserPool;
  readonly sessionTimeoutInMinutes: number;

  constructor(scope: GuStack, id: string, props: CognitoGatekeeperProps) {
    super(scope, id);

    const { app, vpc } = props;
    this.vpc = vpc;
    this.app = app;

    const prefix = `/${scope.stage}/${scope.stack}/${app}`;

    const {
      allowedGroups = ["engineering@guardian.co.uk"],
      sessionTimeoutInMinutes = 15,
      credentialsSecretsManagerPath = `${prefix}/google-auth-credentials`,
    } = props.googleAuth;

    this.sessionTimeoutInMinutes = sessionTimeoutInMinutes;

    if (sessionTimeoutInMinutes > 60) {
      throw new Error("googleAuth.sessionTimeoutInMinutes must be <= 60!");
    }

    if (allowedGroups.length < 1) {
      throw new Error("googleAuth.allowedGroups cannot be empty!");
    }

    if (allowedGroups.find((group: string) => !group.endsWith("@guardian.co.uk"))) {
      throw new Error("googleAuth.allowedGroups must use the @guardian.co.uk domain.");
    }

    const deployToolsAccountId = StringParameter.fromStringParameterName(
      scope,
      "deploy-tools-account-id-parameter",
      NAMED_SSM_PARAMETER_PATHS.DeployToolsAccountId.path,
    );

    const cognitoAuthStage = props.googleAuth.cognitoAuthStage ?? "PROD";

    // See https://github.com/guardian/cognito-auth-lambdas for the source
    // code here. ARN format is:
    // arn:aws:lambda:aws-region:acct-id:function:helloworld.
    const gatekeeperFunctionArn = `arn:aws:lambda:eu-west-1:${deployToolsAccountId.stringValue}:function:deploy-${cognitoAuthStage}-gatekeeper-lambda`;

    // Note, handler and filename must match here:
    // https://github.com/guardian/cognito-auth-lambdas.
    const authLambda = new GuLambdaFunction(scope, "auth-lambda", {
      app: app,
      memorySize: 128,
      handler: "bootstrap",
      runtime: Runtime.PROVIDED_AL2023,
      fileName: `deploy/${cognitoAuthStage}/cognito-lambda/devx-cognito-lambda-amd64-v2.zip`,
      withoutFilePrefix: true,
      withoutArtifactUpload: true,
      bucketNamePath: NAMED_SSM_PARAMETER_PATHS.OrganisationDistributionBucket.path,
      architecture: Architecture.X86_64,
      environment: {
        ALLOWED_GROUPS: allowedGroups.join(","),
        GATEKEEPER_FUNCTION_ARN: gatekeeperFunctionArn,
      },
    });

    Tags.of(authLambda).add("Owner", "DevX");

    authLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [gatekeeperFunctionArn],
      }),
    );

    // Cognito user pool. We require both lambdas: pre-sign-up runs the first
    // time a user attempts to authenticate (before they exist in the User
    // Pool); pre-auth runs in subsequent authentication flows.
    this.userPool = new UserPool(this, "user-pool", {
      lambdaTriggers: {
        preAuthentication: authLambda,
        preSignUp: authLambda,
      },
    });

    // These help ensure domain is deterministic but also unique. Key
    // assumption is that app/stack/stage combo are unique within Guardian.
    const domainPrefix = `com-gu-${app.toLowerCase()}-${scope.stage.toLowerCase()}`;

    this.userPoolDomain = this.userPool.addDomain("domain", {
      cognitoDomain: {
        domainPrefix: getUserPoolDomainPrefix(domainPrefix),
      },
    });

    const clientId = SecretValue.secretsManager(credentialsSecretsManagerPath, { jsonField: "clientId" });
    const clientSecret = SecretValue.secretsManager(credentialsSecretsManagerPath, { jsonField: "clientSecret" });

    const userPoolIdp = new UserPoolIdentityProviderGoogle(scope, "google-idp", {
      userPool: this.userPool,
      clientId: clientId.toString(),
      clientSecretValue: clientSecret,
      attributeMapping: {
        email: ProviderAttribute.GOOGLE_EMAIL,
        givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: ProviderAttribute.GOOGLE_PICTURE,
        custom: {
          name: ProviderAttribute.GOOGLE_NAME,
        },
      },
      scopes: ["openid", "email", "profile"],
    });

    this.userPoolClient = this.userPool.addClient("alb-client", {
      supportedIdentityProviders: [UserPoolClientIdentityProvider.GOOGLE],
      generateSecret: true,
      oAuth: {
        callbackUrls: [`https://${props.googleAuth.domain}/oauth2/idpresponse`],
      },

      // Note: id and access validity token validity cannot be less than one
      // hour (this is the cognito cookie duration). To quickly invalidate
      // credentials, disable the user in Cognito. It might be that we want to
      // parameterise these going forward, but that would require Infosec
      // discussion.
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
    });

    this.userPoolClient.node.addDependency(userPoolIdp);
  }

  /**
   * Connects the authentication infrastructure to a given ALB
   * @param scope 
   * @param loadBalancer 
   * @param listener 
   * @param targetGroup 
   */
  connectToALB(scope: GuStack, loadBalancer: ApplicationLoadBalancer, listener: ApplicationListener, targetGroup: IApplicationTargetGroup) {
    listener.addAction("CognitoAuth", {
      action: new AuthenticateCognitoAction({
        userPool: this.userPool,
        userPoolClient: this.userPoolClient,
        userPoolDomain: this.userPoolDomain,
        next: ListenerAction.forward([targetGroup]),
        sessionTimeout: Duration.minutes(this.sessionTimeoutInMinutes),
      }),
    });

    // Need to give the ALB outbound access on 443 for the IdP endpoints.
    const idpEgressSecurityGroup = new GuHttpsEgressSecurityGroup(scope, "ldp-access", {
      app: this.app,
      vpc: this.vpc,
    });

    loadBalancer.addSecurityGroup(idpEgressSecurityGroup);
  }
}