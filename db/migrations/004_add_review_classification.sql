ALTER TABLE findings
    ADD COLUMN IF NOT EXISTS classification TEXT
        CHECK (classification IN ('true_positive', 'benign_positive', 'false_positive'));