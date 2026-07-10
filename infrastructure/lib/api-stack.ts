import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface ApiStackProps extends cdk.StackProps {
  ecrRepository: ecr.Repository;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  dbEndpoint: string;
}

export class ApiStack extends cdk.Stack {
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // IAM role for App Runner to pull from ECR
    const accessRole = new iam.Role(this, "AppRunnerAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    props.ecrRepository.grantPull(accessRole);

    // IAM role for the running instance
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    // Allow instance to read secrets
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter",
          "ssm:GetParameters",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:dutyhub/*`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/dutyhub/*`,
        ],
      })
    );

    // VPC Connector for App Runner to reach RDS in private subnet
    const vpcConnector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      subnets: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      securityGroups: [props.dbSecurityGroup.securityGroupId],
      vpcConnectorName: "dutyhub-api-connector",
    });

    // Allow App Runner (via VPC connector) to access RDS
    props.dbSecurityGroup.addIngressRule(
      props.dbSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow App Runner to access RDS"
    );

    // App Runner Service
    const service = new apprunner.CfnService(this, "ApiService", {
      serviceName: "dutyhub-api",
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: true,
        imageRepository: {
          imageIdentifier: `${props.ecrRepository.repositoryUri}:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "5000",
            runtimeEnvironmentVariables: [
              { name: "ASPNETCORE_ENVIRONMENT", value: "Production" },
              { name: "ASPNETCORE_URLS", value: "http://+:5000" },
              {
                name: "ConnectionStrings__DefaultConnection",
                value: `Host=${props.dbEndpoint};Port=5432;Database=dutyhub;Username=dutyhub_admin;Password=tBwPzDMs8Ubkggxy=6A=39CS=8IiW0`,
              },
              { name: "ConnectionStrings__Redis", value: "localhost:6379,abortConnect=false" },
              { name: "JwtSettings__Secret", value: "temp-jwt-secret-change-later-to-secure-value" },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: "TCP",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    this.serviceUrl = service.attrServiceUrl;

    new cdk.CfnOutput(this, "ApiServiceUrl", {
      value: `https://${service.attrServiceUrl}`,
    });
  }
}
