import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export class SecretsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // JWT Secret — placeholder, update via AWS Console or CLI
    new ssm.StringParameter(this, "JwtSecret", {
      parameterName: "/dutyhub/jwt-secret",
      stringValue: "CHANGE_ME_AFTER_DEPLOY",
      description: "JWT signing secret for DutyHub API",
      tier: ssm.ParameterTier.STANDARD,
    });

    // Upstash Redis URL — placeholder
    new ssm.StringParameter(this, "RedisUrl", {
      parameterName: "/dutyhub/redis-url",
      stringValue: "CHANGE_ME_AFTER_DEPLOY",
      description: "Upstash Redis connection URL",
      tier: ssm.ParameterTier.STANDARD,
    });

    // Auth mode
    new ssm.StringParameter(this, "AuthMode", {
      parameterName: "/dutyhub/auth-mode",
      stringValue: "local",
      description: "Authentication mode: local | cognito | dual",
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
