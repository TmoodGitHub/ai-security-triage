variable "region" {
    description = "AWS region for all resources"
    type        = string
    default     = "us-east-1"
}

variable "alert_email" {
    description = "Email address that receives budget alerts"
    type        = string
}

variable "jwt_secret" {
    description = "Signing key for analyst sign-in tokens; use the same value as JWT_SECRET in .env"
    type        = string
    sensitive   = true
    ephemeral   = true
}