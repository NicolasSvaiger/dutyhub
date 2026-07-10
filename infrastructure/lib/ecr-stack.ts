import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

export class EcrStack extends cdk.Stack {
  public readonly apiRepository: ecr.Repository;
  public readonly frontendRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.apiRepository = new ecr.Repository(this, "ApiRepo", {
      repositoryName: "dutyhub-api",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: "Keep only 5 most recent images",
        },
      ],
    });

    this.frontendRepository = new ecr.Repository(this, "FrontendRepo", {
      repositoryName: "dutyhub-frontend",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: "Keep only 5 most recent images",
        },
      ],
    });

    new cdk.CfnOutput(this, "ApiRepoUri", {
      value: this.apiRepository.repositoryUri,
    });

    new cdk.CfnOutput(this, "FrontendRepoUri", {
      value: this.frontendRepository.repositoryUri,
    });
  }
}
