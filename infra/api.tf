# Findings API: Lambda behind an API Gateway HTTP API, reached through
# CloudFront at /api/* on the same domain as the dashboard.

# Signing key for sign-in tokens. Write-only: Terraform sends it to AWS but
# never stores it in state. Raise value_wo_version to push a new value.
resource "aws_ssm_parameter" "jwt_secret" {
    name             = "/ai-security-triage/jwt-secret"
    description      = "Signing key for analyst sign-in tokens"
    type             = "SecureString"
    value_wo         = var.jwt_secret
    value_wo_version = 1
}

data "archive_file" "api" {
    type        = "zip"
    source_dir  = "${path.module}/../build/lambda/api"
    output_path = "${path.module}/../build/lambda/api.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
    statement {
        actions = ["sts:AssumeRole"]

        principals {
            type        = "Service"
            identifiers = ["lambda.amazonaws.com"]
        }
    }
}

resource "aws_iam_role" "api" {
    name               = "ai-security-triage-api"
    assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
    role       = aws_iam_role.api.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api" {
    source_policy_documents = [data.aws_iam_policy_document.database_access.json]

    statement {
        sid       = "ReadJwtSecret"
        actions   = ["ssm:GetParameter"]
        resources = [aws_ssm_parameter.jwt_secret.arn]
    }
}

resource "aws_iam_role_policy" "api" {
    name   = "ai-security-triage-api"
    role   = aws_iam_role.api.id
    policy = data.aws_iam_policy_document.api.json
}

# Created here so logs expire; Lambda's own default keeps them forever.
resource "aws_cloudwatch_log_group" "api" {
    name              = "/aws/lambda/ai-security-triage-api"
    retention_in_days = 14
}

resource "aws_lambda_function" "api" {
    function_name    = "ai-security-triage-api"
    role             = aws_iam_role.api.arn
    runtime          = "nodejs24.x"
    architectures    = ["arm64"]
    handler          = "index.handler"
    filename         = data.archive_file.api.output_path
    source_code_hash = data.archive_file.api.output_base64sha256
    memory_size      = 512
    # API Gateway gives up after 30 seconds, so waiting longer is pointless.
    timeout          = 30

    environment {
        variables = {
            DB_DRIVER            = "data-api"
            DB_CLUSTER_ARN       = aws_rds_cluster.db.arn
            DB_SECRET_ARN        = aws_rds_cluster.db.master_user_secret[0].secret_arn
            DB_NAME              = aws_rds_cluster.db.database_name
            JWT_SECRET_PARAMETER = aws_ssm_parameter.jwt_secret.name
            NODE_OPTIONS         = "--enable-source-maps"
        }
    }

    depends_on = [
        aws_cloudwatch_log_group.api,
        aws_iam_role_policy_attachment.api_logs,
    ]
}

resource "aws_apigatewayv2_api" "api" {
    name          = "ai-security-triage-api"
    protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api" {
    api_id                 = aws_apigatewayv2_api.api.id
    integration_type       = "AWS_PROXY"
    integration_uri        = aws_lambda_function.api.invoke_arn
    payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
    api_id    = aws_apigatewayv2_api.api.id
    route_key = "ANY /api/{proxy+}"
    target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
    api_id      = aws_apigatewayv2_api.api.id
    name        = "$default"
    auto_deploy = true

    # Caps request rate so the public endpoint cannot run up a bill.
    default_route_settings {
        throttling_burst_limit = 20
        throttling_rate_limit  = 10
    }
}

resource "aws_lambda_permission" "api_gateway" {
    statement_id  = "AllowApiGatewayInvoke"
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.api.function_name
    principal     = "apigateway.amazonaws.com"
    source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
    name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
    name = "Managed-AllViewerExceptHostHeader"
}