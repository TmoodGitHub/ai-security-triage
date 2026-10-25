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