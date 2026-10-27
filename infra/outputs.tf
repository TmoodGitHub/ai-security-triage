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