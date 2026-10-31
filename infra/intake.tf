resource "aws_s3_bucket" "intake" {
    bucket        = "ai-security-triage-intake-${data.aws_caller_identity.current.account_id}"
    force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "intake" {
    bucket                  = aws_s3_bucket.intake.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "intake" {
    bucket = aws_s3_bucket.intake.id

    rule {
        id     = "expire-uploads"
        status = "Enabled"
        filter {}

        expiration {
            days = 30
        }
    }
}

resource "aws_sqs_queue" "events_dlq" {
    name                      = "ai-security-triage-events-dlq"
    message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "events" {
    name                       = "ai-security-triage-events"
    message_retention_seconds  = 1209600
    visibility_timeout_seconds = 540

    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
        maxReceiveCount     = 3
    })
}

resource "aws_sqs_queue" "intake_failed" {
    name                      = "ai-security-triage-intake-failed"
    message_retention_seconds = 1209600
}

data "archive_file" "intake" {
    type        = "zip"
    source_dir  = "${path.module}/../build/lambda/intake"
    output_path = "${path.module}/../build/lambda/intake.zip"
}

resource "aws_iam_role" "intake" {
    name               = "ai-security-triage-intake"
    assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "intake_logs" {
    role       = aws_iam_role.intake.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "intake" {
    source_policy_documents = [data.aws_iam_policy_document.database_access.json]

    statement {
        sid       = "ReadUploads"
        actions   = ["s3:GetObject"]
        resources = ["${aws_s3_bucket.intake.arn}/*"]
    }

    statement {
        sid       = "QueueEventsAndFailures"
        actions   = ["sqs:SendMessage"]
        resources = [
            aws_sqs_queue.events.arn,
            aws_sqs_queue.intake_failed.arn,
        ]
    }
}

resource "aws_iam_role_policy" "intake" {
    name   = "ai-security-triage-intake"
    role   = aws_iam_role.intake.id
    policy = data.aws_iam_policy_document.intake.json
}

resource "aws_cloudwatch_log_group" "intake" {
    name              = "/aws/lambda/ai-security-triage-intake"
    retention_in_days = 14
}

resource "aws_lambda_function" "intake" {
    function_name    = "ai-security-triage-intake"
    role             = aws_iam_role.intake.arn
    runtime          = "nodejs24.x"
    architectures    = ["arm64"]
    handler          = "index.handler"
    filename         = data.archive_file.intake.output_path
    source_code_hash = data.archive_file.intake.output_base64sha256
    memory_size      = 512
    timeout          = 120

    environment {
        variables = {
            DB_DRIVER        = "data-api"
            DB_CLUSTER_ARN   = aws_rds_cluster.db.arn
            DB_SECRET_ARN    = aws_rds_cluster.db.master_user_secret[0].secret_arn
            DB_NAME          = aws_rds_cluster.db.database_name
            TRIAGE_QUEUE_URL = aws_sqs_queue.events.url
            NODE_OPTIONS     = "--enable-source-maps"
        }
    }

    depends_on = [
        aws_cloudwatch_log_group.intake,
        aws_iam_role_policy_attachment.intake_logs
    ]
}

resource "aws_lambda_function_event_invoke_config" "intake" {
    function_name          = aws_lambda_function.intake.function_name
    maximum_retry_attempts = 2

    destination_config {
        on_failure {
            destination = aws_sqs_queue.intake_failed.arn
        }
    }
}

resource "aws_lambda_permission" "intake_s3" {
    statement_id   = "AllowS3Invoke"
    action         = "lambda:InvokeFunction"
    function_name  = aws_lambda_function.intake.function_name
    principal      = "s3.amazonaws.com"
    source_arn     = aws_s3_bucket.intake.arn
    source_account = data.aws_caller_identity.current.account_id
}

resource "aws_s3_bucket_notification" "intake" {
    bucket = aws_s3_bucket.intake.id

    lambda_function {
        lambda_function_arn = aws_lambda_function.intake.arn
        events              = ["s3:ObjectCreated:*"]
    }

    depends_on = [aws_lambda_permission.intake_s3]
}