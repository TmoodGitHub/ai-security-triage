resource "aws_budgets_budget" "monthly" {
    name         = "ai-security-triage-monthly"
    budget_type  = "COST"
    limit_amount = "20"
    limit_unit   = "USD"
    time_unit    = "MONTHLY"

    cost_types {
        include_credit = false
        include_refund = false
    }

    notification {
        comparison_operator        = "GREATER_THAN"
        threshold                  = 50
        threshold_type             = "PERCENTAGE"
        notification_type          = "FORECASTED"
        subscriber_email_addresses = [var.alert_email]
    }
}