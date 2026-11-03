resource "aws_ssm_parameter" "anthropic_api_key" {
    name             = "/ai-security-triage/anthropic-api-key"
    description      = "Anthropic API key for the triage Lambda"
    type             = "SecureString"
    value_wo         = var.anthropic_api_key
    value_wo_version = 2
}

data "archive_file" "triage" {
    type        = "zip"
    source_dir  = "${path.module}/../build/lambda/triage"
    output_path = "${path.module}/../build/lambda/triage.zip"
}

resource "aws_iam_role" "triage" {
    name               = "ai-security-triage-triage"
    assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "triage_logs" {
    role       = aws_iam_role.triage.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "triage" {
    source_policy_documents = [data.aws_iam_policy_document.database_access.json]

    statement {
        sid = "ConsumeEventsQueue"
        actions = [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
        ]
        resources = [aws_sqs_queue.events.arn]
    }

    statement {
        sid       = "ReadAnthropicKey"
        actions   = ["ssm:GetParameter"]
        resources = [aws_ssm_parameter.anthropic_api_key.arn]
    }
}

resource "aws_iam_role_policy" "triage" {
    name   = "ai-security-triage-triage"
    role   = aws_iam_role.triage.id
    policy = data.aws_iam_policy_document.triage.json
}

resource "aws_cloudwatch_log_group" "triage" {
    name              = "/aws/lambda/ai-security-triage-triage"
    retention_in_days = 14
}

resource "aws_lambda_function" "triage" {
    function_name    = "ai-security-triage-triage"
    role             = aws_iam_role.triage.arn
    runtime          = "python3.13"
    architectures    = ["arm64"]
    handler          = "triage.lambda_handler.handler"
    filename         = data.archive_file.triage.output_path
    source_code_hash = data.archive_file.triage.output_base64sha256
    memory_size      = 512
    timeout          = 180

    environment {
        variables = {
            DB_CLUSTER_ARN              = aws_rds_cluster.db.arn 
            DB_SECRET_ARN               = aws_rds_cluster.db.master_user_secret[0].secret_arn
            DB_NAME                     = aws_rds_cluster.db.database_name
            ANTHROPIC_API_KEY_PARAMETER = aws_ssm_parameter.anthropic_api_key.name
            ANTHROPIC_API_KEY_VERSION   = tostring(aws_ssm_parameter.anthropic_api_key.value_wo_version)
        }
    }

    depends_on = [
        aws_cloudwatch_log_group.triage,
        aws_iam_role_policy_attachment.triage_logs,
    ]
    
    lifecycle {
        ignore_changes = [filename, source_code_hash]
    }
}

resource "aws_lambda_event_source_mapping" "triage" {
    event_source_arn = aws_sqs_queue.events.arn
    function_name    = aws_lambda_function.triage.arn
    batch_size       = 5

    function_response_types = ["ReportBatchItemFailures"]

    scaling_config {
        maximum_concurrency = 2
    }

    depends_on = [aws_iam_role_policy.triage]
}