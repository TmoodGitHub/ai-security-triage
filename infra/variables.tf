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
    description = "GitHub repository allowed to deploy, as owner/name"
    type        = string
    default     = "TmoodGitHub/ai-security-triage"
}