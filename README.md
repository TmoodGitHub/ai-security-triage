# ai-security-triage

AI-assisted triage of AWS security logs. The service takes in CloudTrail events, cleans them into one standard format, and uses a large language model (LLM) to suggest how serious each finding is and why. A person reviews every suggestion before anything is acted on.

## Status

**In progress.** Currently building log intake (step 2 below).

- [x] Sample CloudTrail data
- [x] TypeScript project setup
- [ ] Log intake and cleanup
- [ ] Storage in Postgres
- [ ] Findings API
- [ ] AI triage step, with accuracy tests
- [ ] Analyst screen
- [ ] Infrastructure in Terraform, tests on every push

## How it works

1. **Security logs.** Sample AWS CloudTrail events, which record every action taken in an AWS account.
2. **Take in and clean up.** Each event is converted to one standard format, and duplicates are removed.
3. **Store.** Findings are saved in a Postgres database.
4. **AI triage.** For each new finding, an LLM looks up related threat information and suggests a severity level with a short explanation.
5. **Findings API.** Lists, searches, and returns findings along with the AI's suggestion.
6. **Analyst screen.** A person reviews each suggestion, approves or rejects it, and can export the results.

## Tech

- **TypeScript and Node.js** for log intake and the Findings API
- **Python** for the AI triage step and its accuracy tests
- **PostgreSQL** for storage
- **AWS** (Lambda, SQS, S3) for hosting
- **Terraform** to create the AWS resources
- **GitHub Actions** to run the tests on every push
- **Vitest** for TypeScript tests

## Project layout

```
samples/     Sample CloudTrail events used for development and tests
src/ingest/  Log intake and cleanup
tests/       Tests
infra/       Terraform files
```

## Running it locally

Requires Node.js 20 or later.

```bash
npm install
npm test
```

## About the sample data

The events in `samples/` are made up for development. The IP addresses (198.51.100.x and 203.0.113.x) and the AWS account number (123456789012) are reserved for documentation, so they don't point to any real person or account.

## License

MIT
