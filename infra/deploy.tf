resource "aws_iam_openid_connect_provider" "github" {
    url            = "https://token.actions.githubusercontent.com"
    client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "deploy_assume" {
    statement {
        actions = ["sts:AssumeRoleWithWebIdentity"]

        principals {
            type        = "Federated"
            identifiers = [aws_iam_openid_connect_provider.github.arn]
        }

        condition {
            test     = "StringEquals"
            variable = "token.actions.githubusercontent.com:aud"
            values   = ["sts.amazonaws.com"]
        }

        condition {
            test     = "StringEquals"
            variable = "token.actions.githubusercontent.com:sub"
            values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
        }
    }
}

resource "aws_iam_role" "deploy" {
    name                 = "ai-security-triage-deploy"
    assume_role_policy   = data.aws_iam_policy_document.deploy_assume.json
    max_session_duration = 3600
}

resource "aws_ssm_parameter" "deploy_config" {
    name = "/ai-security-triage/deploy-config"
    type = "String"
    value = jsonencode({
        webBucket      = aws_s3_bucket.web.id
        distributionId = aws_cloudfront_distribution.web.id
        functions = {
            api    = aws_lambda_function.api.function_name
            intake = aws_lambda_function.intake.function_name
            triage = aws_lambda_function.triage.function_name
        }
        dbClusterArn = aws_rds_cluster.db.arn
        dbSecretArn  = aws_rds_cluster.db.master_user_secret[0].secret_arn
        dbName       = aws_rds_cluster.db.database_name
        webBuildEnv = {
            VITE_COGNITO_AUTHORITY = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.analysts.id}"
            VITE_COGNITO_CLIENT_ID = aws_cognito_user_pool_client.web.id
            VITE_COGNITO_DOMAIN    = "https://${aws_cognito_user_pool_domain.analysts.domain}.auth.${var.region}.amazoncognito.com"
        }
    })
}

data "aws_iam_policy_document" "deploy" {
    source_policy_documents = [data.aws_iam_policy_document.database_access.json]

    statement {
        sid       = "ReadDeployConfig"
        actions   = ["ssm:GetParameter"]
        resources = [aws_ssm_parameter.deploy_config.arn]
    }

    statement {
        sid = "UpdateFunctionCode"
        actions = [
            "lambda:UpdateFunctionCode",
            "lambda:GetFunctionConfiguration",
        ]
        resources = [
            aws_lambda_function.api.arn,
            aws_lambda_function.intake.arn,
            aws_lambda_function.triage.arn,
        ]
    }

    statement {
        sid       = "ListWebBucket"
        actions   = ["s3:ListBucket"]
        resources = [aws_s3_bucket.web.arn]
    }

    statement {
        sid       = "WriteWebFiles"
        actions   = ["s3:PutObject", "s3:DeleteObject"]
        resources = ["${aws_s3_bucket.web.arn}/*"]
    }

    statement {
        sid       = "RefreshCdn"
        actions   = ["cloudfront:CreateInvalidation"]
        resources = [aws_cloudfront_distribution.web.arn]
    }
}

resource "aws_iam_role_policy" "deploy" {
    name   = "ai-security-triage-deploy"
    role   = aws_iam_role.deploy.id
    policy = data.aws_iam_policy_document.deploy.json
}