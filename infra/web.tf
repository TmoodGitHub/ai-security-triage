data "aws_caller_identity" "current" {}

data "aws_cloudfront_cache_policy" "caching_optimized" {
    name = "Managed-CachingOptimized"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
    name = "Managed-SecurityHeadersPolicy"
}

resource "aws_s3_bucket" "web" {
    bucket        = "ai-security-triage-web-${data.aws_caller_identity.current.account_id}"
    force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "web" {
    bucket                  = aws_s3_bucket.web.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
    name                              = "ai-security-triage-web"
    origin_access_control_origin_type = "s3"
    signing_behavior                  = "always"
    signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "web" {
    enabled             = true
    comment             = "ai-security-triage analyst dashboard"
    default_root_object = "index.html"
    price_class         = "PriceClass_100"

    origin {
        origin_id                = "web-bucket"
        domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
        origin_access_control_id = aws_cloudfront_origin_access_control.web.id 
    }

    origin {
        origin_id   = "api"
        domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")

        custom_origin_config {
            http_port              = 80
            https_port             = 443
            origin_protocol_policy = "https-only"
            origin_ssl_protocols   = ["TLSv1.2"]
        }
    }

    default_cache_behavior {
        target_origin_id            = "web-bucket"
        viewer_protocol_policy      = "redirect-to-https"
        allowed_methods             = ["GET", "HEAD"]
        cached_methods               = ["GET", "HEAD"]
        compress                    = true
        cache_policy_id             = data.aws_cloudfront_cache_policy.caching_optimized.id
        response_headers_policy_id  = data.aws_cloudfront_response_headers_policy.security_headers.id
    }

    ordered_cache_behavior {
        path_pattern             = "/api/*"
        target_origin_id         = "api"
        viewer_protocol_policy   = "https-only"
        allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
        cached_methods           = ["GET", "HEAD"]
        compress                 = true
        cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
        origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    }

    restrictions {
        geo_restriction {
            restriction_type = "none"
        }
    }

    viewer_certificate {
        cloudfront_default_certificate= true
    }
}

data "aws_iam_policy_document" "web_bucket" {
    statement {
        sid       = "AllowCloudFrontRead"
        actions   = ["s3:GetObject"]
        resources = ["${aws_s3_bucket.web.arn}/*"]

        principals {
            type        = "Service"
            identifiers = ["cloudfront.amazonaws.com"]
        }

        condition {
            test        = "StringEquals"
            variable    = "AWS:SourceArn"
            values      = [aws_cloudfront_distribution.web.arn]
        }
    }
}

resource "aws_s3_bucket_policy" "web" {
    bucket     = aws_s3_bucket.web.id
    policy     = data.aws_iam_policy_document.web_bucket.json
    depends_on = [aws_s3_bucket_public_access_block.web]
}