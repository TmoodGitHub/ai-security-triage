output "web_url" {
    description = "Public URL of the analyst dashboard"
    value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket" {
    description = "S3 bucket that holds the built web app"
    value       = aws_s3_bucket.web.id
}

output "web_distribution_id" {
    description = "CloudFront distribution ID"
    value       = aws_cloudfront_distribution.web.id
}

output "db_cluster_arn" {
    value = aws_rds_cluster.db.arn
}

output "db_secret_arn" {
    value = aws_rds_cluster.db.master_user_secret[0].secret_arn
}

output "api_endpoint" {
    description = "API Gateway URL; the dashboard reaches it through CloudFront at /api"
    value       = aws_apigatewayv2_api.api.api_endpoint
}

output "intake_bucket" {
    description = "Upload CloudTrail files here to ingest them"
    value       = aws_s3_bucket.intake.id
}

output "events_queue_url" {
    description = "Queue of event IDs waiting for triage"
    value       = aws_sqs_queue.events.url
}

output "cognito_user_pool_id" {
    value = aws_cognito_user_pool.analysts.id
}

output "cognito_client_id" {
    value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
    description = "Base URL of the hosted sign-in page"
    value       = "https://${aws_cognito_user_pool_domain.analysts.domain}.auth.${var.region}.amazoncognito.com"
}

output "web_build_env" {
    value = <<-EOT
        VITE_COGNITO_AUTHORITY=https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.analysts.id}
        VITE_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.web.id}
        VITE_COGNITO_DOMAIN=https://${aws_cognito_user_pool_domain.analysts.domain}.auth.${var.region}.amazoncognito.com
    EOT
}

output "deploy_role_arn" {
    description = "Role the GitHub Actions deploy job assumes; store as the AWS_DEPLOY_ROLE_ARN repository variable"
    value       = aws_iam_role.deploy.arn
}