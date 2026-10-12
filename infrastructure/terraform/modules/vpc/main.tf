# VPC Module for Hakawi
# Creates a VPC with public and private subnets across multiple AZs
# Includes NAT Gateways, Internet Gateway, and appropriate route tables

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  instance_tenancy     = "default"

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-igw"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-nat-eip-${count.index}"
  })
}

# NAT Gateways (one per AZ for HA)
resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  connectivity_type = "public"

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = length(var.public_subnets)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnets[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-public-${var.availability_zones[count.index]}"
    Type = "public"
    "kubernetes.io/role/elb" = "1"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.private_subnets)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnets[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-private-${var.availability_zones[count.index]}"
    Type = "private"
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# Database Subnets (dedicated CIDR range for RDS)
# WHY an explicit `var.database_subnets` and not cidrsubnet() off the private ranges:
# `cidrsubnet(var.private_subnets[i], 4, i + 10)` produced /28 blocks INSIDE the private
# /24s, and AWS rejects a VPC with overlapping subnet CIDRs, so every apply failed. The
# ranges now come from the environment tfvars and are disjoint from the public, private
# and cache tiers by construction.
#
# WHY THE FIRST APPLY AFTER THIS CHANGE NEEDS A HUMAN (one-time, do not let a deploy do it):
# `cidr_block` is ForceNew on `aws_subnet`, so an environment whose state still holds the
# OLD `/28` slices cannot move to the new `/24`s by apply — Terraform plans a DESTROY+CREATE
# of every database subnet, and the destroy fails while RDS still holds ENIs in them
# ("The subnet is in use / DependencyViolation"). A deploy would then be red until someone
# does it out of band:
#   1. move the DB subnet group to the new tier (create `aws_db_subnet_group` entries for
#      the new subnet IDs, or `terraform state mv`/import the new subnets so state and AWS
#      agree — never a live destroy of a subnet that holds an ENI),
#   2. confirm the RDS instance reports the new subnet IDs,
#   3. then apply.
# Each deploy workflow guards this with a "Preflight: subnet replacement" step that plans
# first and fails fast when any `aws_subnet` would be replaced or destroyed, so the apply
# is never the thing that discovers it. Do NOT "fix" it by reverting to the overlapping
# `/28` slices: AWS rejects those, which is why they were replaced in the first place.
resource "aws_subnet" "database" {
  count             = length(var.database_subnets)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.database_subnets[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-db-${var.availability_zones[count.index]}"
    Type = "database"
  })
}

# Cache Subnets (dedicated CIDR range for ElastiCache/Valkey)
# WHY a dedicated tier: the ElastiCache replication group previously ran in the private
# subnets, so the cache tier had no address boundary of its own and the database overlap
# fix above had to reason about "every subnet" to stay safe. Valkey now has its own
# hundred-block, which keeps each tier's blast radius (route table, future NACLs, peering
# filters) expressible on its own.
resource "aws_subnet" "cache" {
  count             = length(var.cache_subnets)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.cache_subnets[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-cache-${var.availability_zones[count.index]}"
    Type = "cache"
  })
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private Route Tables (one per AZ for NAT HA)
resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-private-rt-${count.index}"
  })
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Database Route Tables (no internet access)
# `count` follows the database subnets (not the AZ list) so an environment that declares
# fewer database subnets than AZs still renders one table per subnet it actually created.
resource "aws_route_table" "database" {
  count  = length(var.database_subnets)
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-db-rt-${count.index}"
  })
}

resource "aws_route_table_association" "database" {
  count          = length(aws_subnet.database)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database[count.index].id
}

# Cache Route Table Associations
# WHY the cache tier reuses the private route tables instead of getting its own: the
# ElastiCache nodes never initiate internet traffic, but they DO need the NAT + S3 gateway
# routes for control-plane-side operations (snapshot transfer, log delivery), and the
# private tables already carry exactly those. Owning a second identical table would only
# be a second thing to keep in sync (Principle #9).
resource "aws_route_table_association" "cache" {
  count          = length(aws_subnet.cache)
  subnet_id      = aws_subnet.cache[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Security Groups
resource "aws_security_group" "cluster" {
  name        = "${var.environment}-hakawi-cluster-sg"
  description = "Security group for EKS cluster"
  vpc_id      = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-cluster-sg"
  })
}

resource "aws_security_group" "database" {
  name        = "${var.environment}-hakawi-db-sg"
  description = "Security group for RDS databases"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL from EKS nodes"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [aws_security_group.cluster.id]
  }

  ingress {
    description = "PgBouncer from EKS nodes"
    from_port   = 6432
    to_port     = 6432
    protocol    = "tcp"
    security_groups = [aws_security_group.cluster.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-db-sg"
  })
}

resource "aws_security_group" "cache" {
  name        = "${var.environment}-hakawi-cache-sg"
  description = "Security group for ElastiCache"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Valkey from EKS nodes"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    security_groups = [aws_security_group.cluster.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-cache-sg"
  })
}

resource "aws_security_group" "alb" {
  name        = "${var.environment}-hakawi-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-alb-sg"
  })
}

# VPC Endpoints for AWS services (cost optimization and security)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private[*].id, aws_route_table.database[*].id]

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-s3-endpoint"
  })
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.cluster.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-ecr-api-endpoint"
  })
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.cluster.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-ecr-dkr-endpoint"
  })
}

resource "aws_vpc_endpoint" "cloudwatch_logs" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.cluster.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-cloudwatch-logs-endpoint"
  })
}

resource "aws_vpc_endpoint" "sts" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.sts"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.cluster.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-sts-endpoint"
  })
}

# WHY a Secrets Manager interface endpoint: every application secret (database, Valkey,
# JWT, Paymob — see modules/secrets, modules/rds, modules/elasticache) is read from AWS
# Secrets Manager at runtime by the External Secrets operator inside this VPC. Without
# the endpoint that traffic hairpins through the NAT gateways, which means the secret
# sync path — and therefore the whole boot path — depends on NAT availability and pays
# NAT data-processing costs. Private DNS keeps the standard AWS hostnames resolving to
# the endpoint, so no application-side configuration changes are needed. It follows the
# ecr.api/ecr.dkr/logs/sts pattern already in this module.
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.cluster.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-secretsmanager-endpoint"
  })
}

# DB Subnet Group for RDS
resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-hakawi-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-db-subnet-group"
  })
}

# VPC Flow Logs
# WHY: without flow logs, network-level incidents (a security group that stopped
# accepting 5432, a NAT that dropped return traffic, an exfiltration pattern) are
# invisible until the application reports symptoms. Flow logs to CloudWatch give the
# accept/reject record for every flow in the VPC. Retention follows the pattern used by
# the RDS/ElastiCache modules (longer in production).
resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/${var.environment}-hakawi/flow-logs"
  retention_in_days = var.environment == "production" ? 90 : 30

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-vpc-flow-logs"
  })
}

resource "aws_iam_role" "vpc_flow" {
  name = "${var.environment}-hakawi-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-vpc-flow-logs-role"
  })
}

resource "aws_iam_role_policy" "vpc_flow" {
  name = "${var.environment}-hakawi-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Effect = "Allow"
      # The ":*" suffix (log streams) is required: PutLogEvents writes to streams
      # inside the group, and a resource of just the group ARN denies the write.
      Resource = "${aws_cloudwatch_log_group.vpc_flow.arn}:*"
    }]
  })
}

resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "cloudwatch-logs"
  log_group_name       = aws_cloudwatch_log_group.vpc_flow.name
  iam_role_arn         = aws_iam_role.vpc_flow.arn

  # 600s is the longest aggregation window AWS offers: fewer, larger records means
  # lower CloudWatch ingest cost for the same information.
  max_aggregation_interval = 600

  tags = merge(var.tags, {
    Name = "${var.environment}-hakawi-vpc-flow-logs"
  })
}