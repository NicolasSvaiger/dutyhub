import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";

interface DnsStackProps extends cdk.StackProps {
  domainName: string;
  appSubdomain: string;
  distribution: cloudfront.Distribution;
  appRunnerServiceUrl: string;
}

export class DnsStack extends cdk.Stack {
  public readonly hostedZone: route53.HostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // Route 53 hosted zone
    this.hostedZone = new route53.HostedZone(this, "HostedZone", {
      zoneName: props.domainName,
    });

    // ACM certificate with wildcard
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // A record: app.laulab.com -> CloudFront
    new route53.ARecord(this, "AppARecord", {
      zone: this.hostedZone,
      recordName: props.appSubdomain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(props.distribution)
      ),
    });

    // CNAME: api.laulab.com -> App Runner service URL
    new route53.CnameRecord(this, "ApiCnameRecord", {
      zone: this.hostedZone,
      recordName: `api.${props.domainName}`,
      domainName: props.appRunnerServiceUrl,
    });

    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
    });

    new cdk.CfnOutput(this, "NameServers", {
      value: cdk.Fn.join(", ", this.hostedZone.hostedZoneNameServers!),
    });

    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
    });
  }
}
