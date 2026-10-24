provider "aws" {
    region = var.region

    default_tags {
        tags = {
            Project   = "ai-security-triage"
            ManagedBy = "terraform"
        }
    }
}