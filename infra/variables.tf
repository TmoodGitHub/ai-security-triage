variable "region" {
    description = "AWS region for all resources"
    type        = string
    default     = "us-east-1"
}

variable "alert_email" {
    description = "Email address that receives budget alerts"
    type        = string
}

variable "anthropic_api_key" {
    description = "Antrhopic API key used by the triage Lambda"
    type        = string
    sensitive   = true
    ephemeral   = true
}

variable "github_repository" {
    description = "GitHub repository allowed to deploy, as it appears in GitHub's OIDC subject: owner@owner-id/name@repository-id"
    type        = string
    default     = "TmoodGitHub@28756300/ai-security-triage@1394993262"
}