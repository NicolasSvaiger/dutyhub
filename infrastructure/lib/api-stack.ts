import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface ApiStackProps extends cdk.StackProps {
  ecrRepository: ecr.Repository;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  dbEndpoint: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoBackendClientId: string;
  /**
   * The RDS instance's own generated-credentials Secret object (from
   * DatabaseStack's `rds.Credentials.fromGeneratedSecret(...)`) — NOT a
   * hardcoded ARN string. This is the single source of truth for the
   * master user's current password: it's the same Secret construct RDS
   * itself reads from when the DatabaseInstance resource is created or
   * updated, so it can't drift the way a manually-copied secret can.
   *
   * An earlier version of this fix pointed at a separate, hand-maintained
   * secret (`dutyhub/db-connection-string`) that looked plausible — right
   * host/port/db/username, verified against `aws rds describe-db-instances`
   * — but had a stale password, which is *exactly* the class of bug this
   * approach eliminates: there's no second copy of the password to go
   * stale, because we read the fields (host/port/dbname/username/password)
   * directly off dbSecret at synth time via secretValueFromJson, which
   * CloudFormation resolves at container start. Confirmed working: this is
   * the same secret DatabaseStack passes to CognitoStack's
   * pre-token-generation Lambda (`dbSecretArn: databaseStack.dbInstance.
   * secret!.secretArn` in bin/infrastructure.ts) for its own Postgres
   * connection.
   */
  dbSecret: secretsmanager.ISecret;
  /**
   * Full Redis connection string (StackExchange.Redis format) pointing at
   * the real ElastiCache cluster (`dutyhub-redis`). Not a secret — that
   * cluster has TransitEncryption/AuthToken disabled (confirmed via `aws
   * elasticache describe-cache-clusters`), so there's no credential to
   * protect, just a hostname. Passed as a plain env var, same as
   * docker-compose.yml does for local dev Redis.
   */
  redisConnectionString: string;
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

    // Allow instance to call Cognito Admin APIs — face-login CUSTOM_AUTH
    // flow (AdminInitiateAuth/AdminRespondToAuthChallenge/AdminGetUser) plus
    // the admin user-invite flow added in Sprint 7E (AdminCreateUser,
    // AdminDeleteUser for the create-rollback compensating action, and
    // AdminUpdateUserAttributes for email edits) — see CognitoAuthService.cs.
    // AdminSetUserPassword is kept for parity even though no current call
    // site uses it, since it's part of the same admin-auth surface.
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminUpdateUserAttributes",
        ],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
        ],
      })
    );

    // ----- Cognito VPC Interface Endpoint -----
    // The VPC has natGateways: 0 (see network-stack.ts) — no route to the
    // public internet at all. That's fine for RDS/S3 (already reachable
    // via the isolated subnets / S3 gateway endpoint), but it silently
    // breaks every admin-side Cognito call the backend makes directly
    // (AdminCreateUser, AdminDeleteUser, AdminGetUser, AdminInitiateAuth,
    // AdminRespondToAuthChallenge, AdminUpdateUserAttributes — see
    // CognitoAuthService.cs). Those requests never get a response: the
    // SDK's TCP connect to cognito-idp.<region>.amazonaws.com just hangs
    // until the client-side timeout, which is why "criar usuário" gets
    // stuck on "Salvando..." with the request sitting at (pending) in the
    // browser's network tab instead of failing fast.
    //
    // A PrivateLink interface endpoint resolves that DNS name to a private
    // IP inside the VPC instead, at ~$7-8/mo — far cheaper than a NAT
    // Gateway (~$32/mo + data processing) and we don't need general
    // internet egress for anything else the API does today.
    const cognitoEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      "CognitoEndpointSecurityGroup",
      {
        vpc: props.vpc,
        // No apostrophes/contractions here — EC2 security group
        // descriptions only accept [a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*], and a
        // literal "'" (e.g. "API's") fails CREATE with HandlerErrorCode:
        // InvalidRequest, which cascades into a full stack rollback taking
        // every other resource in this changeset down with it.
        description: "Allow the API VPC connector to reach the Cognito Interface Endpoint",
        allowAllOutbound: false,
      }
    );

    // Dedicated security group for the VPC connector's Cognito egress,
    // deliberately kept separate from dbSecurityGroup. dbSecurityGroup is
    // owned by DatabaseStack (this stack only receives it by reference) —
    // an earlier version of this change added an egress rule directly to
    // it, and `cdk diff` flagged that as forcing replacement of the
    // *production RDS* security group (a VpcId "requires replacement"
    // signal), because mutating a DatabaseStack-owned resource from here
    // pulls in a cross-stack token. Not a risk worth taking for a
    // Cognito-only change. This new SG is 100% owned by ApiStack, so its
    // rules only ever reference other ApiStack resources below — no
    // cross-stack tokens, nothing that touches DatabaseStack or RDS.
    const apiCognitoEgressSecurityGroup = new ec2.SecurityGroup(
      this,
      "ApiCognitoEgressSecurityGroup",
      {
        vpc: props.vpc,
        description: "VPC connector egress to the Cognito Interface Endpoint",
        allowAllOutbound: false,
      }
    );

    cognitoEndpointSecurityGroup.addIngressRule(
      apiCognitoEgressSecurityGroup,
      ec2.Port.tcp(443),
      // Same InvalidRequest failure mode as the SG description above
      // applies to rule descriptions too — no apostrophes.
      "Allow the API VPC connector to call Cognito Admin APIs"
    );
    apiCognitoEgressSecurityGroup.addEgressRule(
      cognitoEndpointSecurityGroup,
      ec2.Port.tcp(443),
      "Allow the VPC connector to reach the Cognito Interface Endpoint"
    );

    // Using the InterfaceVpcEndpoint construct directly (scoped to `this`,
    // i.e. ApiStack) instead of the `vpc.addInterfaceEndpoint(...)`
    // convenience method. That method attaches the endpoint as a child of
    // the Vpc construct, which lives in NetworkStack — since the endpoint
    // references cognitoEndpointSecurityGroup (defined here in ApiStack),
    // that would make NetworkStack depend on ApiStack. NetworkStack is
    // already an upstream dependency of ApiStack (via DatabaseStack, which
    // needs the VPC), so that reverse edge closes a cycle at synth time.
    //
    // Only one of the two PRIVATE_ISOLATED subnets, not both: verified via
    // `aws ec2 describe-vpc-endpoint-services` that com.amazonaws.<region>.
    // cognito-idp only supports us-east-1b/c/d — this VPC's subnets sit in
    // us-east-1a and us-east-1b (`aws ec2 describe-subnets`), and passing
    // the us-east-1a one causes CREATE_FAILED ("does not support the
    // availability zone of the subnet"), which cascades into a full
    // rollback of every other resource in the changeset. Single-AZ here is
    // an accepted tradeoff for this fix — the VPC connector itself already
    // spans both subnets for RDS, so this only reduces redundancy for the
    // Cognito path specifically, not overall API availability.
    const cognitoEndpointSubnet = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      availabilityZones: ["us-east-1b"],
    }).subnets[0];

    new ec2.InterfaceVpcEndpoint(this, "CognitoEndpoint", {
      vpc: props.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      subnets: { subnets: [cognitoEndpointSubnet] },
      securityGroups: [cognitoEndpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // VPC Connector for App Runner to reach RDS (via dbSecurityGroup,
    // unchanged) and now also the Cognito Interface Endpoint (via the new
    // apiCognitoEgressSecurityGroup, added to the connector's SG list).
    // Note: AWS::AppRunner::VpcConnector is immutable — CloudFormation
    // replaces it whenever its SecurityGroups list changes, so deploying
    // this recreates the connector (and briefly redeploys the App Runner
    // service to point at the new one). That's an expected, reversible
    // App Runner-side change; it does not touch RDS or any stateful data.
    const vpcConnector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      subnets: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      securityGroups: [
        props.dbSecurityGroup.securityGroupId,
        apiCognitoEgressSecurityGroup.securityGroupId,
      ],
      // No fixed vpcConnectorName. VpcConnector is immutable — changing its
      // SecurityGroups list forces CloudFormation to create-then-delete a
      // replacement, and with a hardcoded name the create step collides
      // with the still-live original ("VPC connector name
      // dutyhub-api-connector already exists"), failing the whole
      // changeset. Leaving this unset lets CloudFormation generate a
      // unique name for the new connector, same as it already does for
      // every other resource's logical ID suffix in this stack.
    });

    // Allow App Runner (via VPC connector) to access RDS
    props.dbSecurityGroup.addIngressRule(
      props.dbSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow App Runner to access RDS"
    );

    // App Runner's RuntimeEnvironmentSecrets can only reference ONE secret
    // field per entry (`secretArn:jsonKey::` syntax) — it cannot assemble a
    // full "Host=...;Password=..." connection string the way
    // Fn::Join/SecretValue concatenation can. And doing that concatenation
    // as a PLAIN runtimeEnvironmentVariable (an earlier version of this
    // fix tried exactly that) doesn't actually protect the password: even
    // though the value looks like a masked dynamic reference in the
    // synthesized template, CloudFormation resolves it to plaintext before
    // calling the App Runner API, so `aws apprunner describe-service`
    // would return the real password in cleartext right back — normal env
    // vars get no masking at all, only RuntimeEnvironmentSecrets does.
    //
    // host/port/dbname/username are NOT sensitive on their own (the fixed
    // "dutyhub_admin" username or the RDS hostname grant nothing without
    // the password), so they're passed as plain literals/tokens rather
    // than routed through the secret at all — one less thing depending on
    // dynamic-reference resolution behavior inside a CfnService property
    // that hasn't been explicitly verified to support it:
    //   - host: props.dbEndpoint, the same Fn::ImportValue-backed token
    //     the ORIGINAL (pre-Cognito-fix) working config used for this
    //     exact field, so it's already proven to resolve correctly here.
    //   - port/dbname/username: static literals matching DatabaseStack's
    //     `databaseName: "dutyhub"` and
    //     `Credentials.fromGeneratedSecret("dutyhub_admin", ...)`.
    // ONLY the password goes through RuntimeEnvironmentSecrets, pointing
    // at the "password" field of props.dbSecret — the same Secret object
    // DatabaseStack's RDS instance was created with, so it can never drift
    // from the instance's actual current password the way the previous
    // hand-copied `dutyhub/db-connection-string` secret did. Program.cs
    // assembles the final Npgsql connection string from these pieces at
    // startup (see DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD
    // handling added there).
    const dbHost = props.dbEndpoint;
    const dbPort = "5432";
    const dbName = "dutyhub";
    const dbUsername = "dutyhub_admin";

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
            // Program.cs assembles ConnectionStrings:DefaultConnection from
            // DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD at startup
            // (falls back to a literal ConnectionStrings__DefaultConnection
            // env var if one is set directly, which is what
            // docker-compose.yml does for local dev). Program.cs also
            // reads ConnectionStrings:Redis (cache, token blacklist,
            // distributed lock, biometric proof, health checks) — both are
            // required for the API to function, not optional. The live App
            // Runner service already had both connectivity paths working
            // before this fix, just via a stale secret and a "localhost"
            // Redis placeholder respectively (confirmed via `cdk diff` and
            // application logs) — without setting them here, deploying
            // this stack would take down DB + cache connectivity entirely.
            runtimeEnvironmentVariables: [
              { name: "ASPNETCORE_ENVIRONMENT", value: "Production" },
              { name: "ASPNETCORE_URLS", value: "http://+:5000" },
              { name: "Cognito__Region", value: this.region },
              { name: "Cognito__UserPoolId", value: props.cognitoUserPoolId },
              { name: "Cognito__ClientId", value: props.cognitoClientId },
              { name: "Cognito__BackendClientId", value: props.cognitoBackendClientId },
              { name: "ConnectionStrings__Redis", value: props.redisConnectionString },
              { name: "DB_HOST", value: dbHost },
              { name: "DB_PORT", value: dbPort },
              { name: "DB_NAME", value: dbName },
              { name: "DB_USERNAME", value: dbUsername },
            ],
            // The ONLY field that goes through App Runner's native secret
            // mechanism — resolved by the running container reading from
            // Secrets Manager via the instance role's
            // secretsmanager:GetSecretValue grant (already present above).
            // Unlike the plain vars, this one is genuinely never visible
            // in cleartext through the CloudFormation template, the
            // console, or `describe-service`.
            runtimeEnvironmentSecrets: [
              { name: "DB_PASSWORD", value: `${props.dbSecret.secretArn}:password::` },
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
