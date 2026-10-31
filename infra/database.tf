data "aws_availability_zones" "available" {
    state = "available"
}

resource "aws_vpc" "main" {
    cidr_block           = "10.0.0.0/16"
    enable_dns_support   = true
    enable_dns_hostnames = true

    tags = { Name = "ai-security-triage" }
}

resource "aws_subnet" "db" {
    count               = 2
    vpc_id              = aws_vpc.main.id
    cidr_block          = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
    availability_zone   = data.aws_availability_zones.available.names[count.index]

    tags = { Name = "ai-security-triage-db-${count.index}" }
}

resource "aws_db_subnet_group" "db" {
    name       = "ai-security-triage"
    subnet_ids = aws_subnet.db[*].id
}

resource "aws_security_group" "db" {
    name        = "ai-security-triage-db"
    description = "Aurora cluster, no inbound access; queries go through the Data API"
    vpc_id      = aws_vpc.main.id
}

resource "aws_rds_cluster" "db" {
    cluster_identifier = "ai-security-triage"
    engine             = "aurora-postgresql"
    engine_mode        = "provisioned"
    engine_version     = "17.11"
    database_name      = "triage"
    master_username    = "triage_admin"

    manage_master_user_password = true
    enable_http_endpoint = true

    db_subnet_group_name   = aws_db_subnet_group.db.name
    vpc_security_group_ids = [aws_security_group.db.id]
    storage_encrypted      = true

    backup_retention_period = 1
    skip_final_snapshot     = true

    serverlessv2_scaling_configuration {
        min_capacity             = 0
        max_capacity             = 1
        seconds_until_auto_pause = 300
    } 
}

resource "aws_rds_cluster_instance" "db" {
    identifier         = "ai-security-triage"
    cluster_identifier  = aws_rds_cluster.db.id
    instance_class      = "db.serverless"
    engine              = aws_rds_cluster.db.engine
    engine_version      = aws_rds_cluster.db.engine_version
}

data "aws_iam_policy_document" "database_access" {
    statement {
        sid = "QueryDatabase"
        actions = [
            "rds-data:ExecuteStatement",
            "rds-data:BeginTransaction",
            "rds-data:CommitTransaction",
            "rds-data:RollbackTransaction",
        ]
        resources = [aws_rds_cluster.db.arn]
    }

    statement {
        sid       = "ReadDatabaseSecret"
        actions   = ["secretsmanager:GetSecretValue"]
        resources = [aws_rds_cluster.db.master_user_secret[0].secret_arn]
    }
}