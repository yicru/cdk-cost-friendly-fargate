import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cdk from "aws-cdk-lib";
import * as ecrdeploy from "cdk-ecr-deployment";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "node:path";

export class CdkCostFriendlyFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: "PublicSubnet",
        },
      ],
    });

    const repository = new ecr.Repository(this, "Repository");

    const dockerImageAsset = new DockerImageAsset(this, "DockerImageAsset", {
      directory: path.join(__dirname, "../assets"),
      platform: Platform.LINUX_AMD64,
    });

    new ecrdeploy.ECRDeployment(this, "DeployDockerImage", {
      dest: new ecrdeploy.DockerImageName(
        repository.repositoryUriForTag("latest"),
      ),
      src: new ecrdeploy.DockerImageName(dockerImageAsset.imageUri),
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "Task", {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const container = taskDefinition.addContainer("Container", {
      image: ecs.ContainerImage.fromEcrRepository(repository),
    });

    container.addPortMappings({
      containerPort: 80,
    });

    const service = new ecs.FargateService(this, "FargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [],
      assignPublicIp: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener("Listener", {
      port: 80,
      open: true,
    });

    listener.addTargets("ECS", {
      port: 80,
      targets: [service],
    });
  }
}
