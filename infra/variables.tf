variable "region" {
    description = "AWS region for all resources"
    type        = string
    default     = "us-east-1"
}

variable "alert_email" {
    description = "Email address that receives budget alerts"
    type        = string
}