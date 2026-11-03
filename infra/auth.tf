locals {
    web_url = "https://${aws_cloudfront_distribution.web.domain_name}"
}

resource "aws_cognito_user_pool" "analysts" {
    name = "ai-security-triage-analysts"

    admin_create_user_config {
        allow_admin_create_user_only = true
    }

    username_attributes      = ["email"]
    auto_verified_attributes = ["email"]

    password_policy {
        minimum_length                   = 12
        require_lowercase                = true
        require_uppercase                = true
        require_numbers                  = true
        require_symbols                  = true
        temporary_password_validity_days = 7
    }

    mfa_configuration = "OPTIONAL"
    software_token_mfa_configuration {
        enabled = true
    }

    account_recovery_setting {
        recovery_mechanism {
            name     = "verified_email"
            priority = 1
        }
    }
}

resource "aws_cognito_user_pool_client" "web" {
    name         = "web"
    user_pool_id = aws_cognito_user_pool.analysts.id

    generate_secret                      = false
    allowed_oauth_flows_user_pool_client = true
    allowed_oauth_flows                  = ["code"]
    allowed_oauth_scopes                 = ["openid", "email"]
    supported_identity_providers         = ["COGNITO"]
    explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

    callback_urls = ["${local.web_url}/", "http://localhost:5173/"]
    logout_urls   = ["${local.web_url}/", "http://localhost:5173/"]

    access_token_validity  = 1
    id_token_validity      = 1
    refresh_token_validity = 12

    token_validity_units {
        access_token  = "hours"
        id_token      = "hours"
        refresh_token = "hours"
    }

    prevent_user_existence_errors = "ENABLED"
    enable_token_revocation       = true
}

resource "aws_cognito_user_pool_domain" "analysts" {
    domain       = "ai-security-triage-${data.aws_caller_identity.current.account_id}"
    user_pool_id = aws_cognito_user_pool.analysts.id
}