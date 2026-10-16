# ai-security-triage

![CI](https://github.com/TmoodGitHub/ai-security-triage/actions/workflows/ci.yml/badge.svg)

AI-assisted triage of AWS security logs. The service takes in CloudTrail events, cleans them into one standard format, and uses a large language model (LLM) to suggest how serious each one is and why. A person reviews every suggestion before anything is acted on, and records whether the AI got it right.

## Status

**In progress.** Next: measuring cost and time per alert.

- [x] Sample CloudTrail data
- [x] TypeScript project setup
- [x] Log intake and cleanup
- [x] Storage in Postgres
- [x] AI triage step, with accuracy tests (evals)
- [x] Findings API, with sign-in tokens
- [x] Analyst screen
- [x] Tests on every push (GitHub Actions)
- [x] Build the analyst screen in CI
- [x] Cost, time and failure rate per alert + Python tests
- [ ] Evals: count ratings that were too low vs too high
- [ ] Security dashboard design for the analyst screen
- [ ] Infrastructure in Terraform (live on AWS)
- [ ] Stretch: let the AI choose its own lookups (tool calling), compared against the fixed rules in evals

## How it works

1. **Security logs.** Sample AWS CloudTrail events, which record every action taken in an AWS account.
2. **Take in and clean up.** Each event is converted to one standard format, and duplicates are removed.
3. **Store.** Events are saved in a Postgres database.
4. **AI triage.** For each event, the code pulls related activity (same user or same IP address within 24 hours) and sends it with the event to Claude. Claude returns a severity (low, medium, high or critical), a summary, its reasoning, the evidence it used, and what it couldn't tell. The result is saved as a finding.
5. **Findings API.** Lists findings with filters, returns one finding with its original event, and records reviews. Every request needs a signed token.
6. **Analyst screen.** A person filters the findings, reads the AI's reasoning and the raw event, and submits a review:
   - **Decision:** was the AI's severity right (approve) or wrong (reject)?
   - **Classification:** what was the activity: a real threat (true positive), real but expected (benign positive), or a wrong finding (false positive)?
   - **Note:** required, explaining the call.

   Keeping the decision separate from the classification gives an ongoing measure of how often the AI's severity is right.

## Accuracy tests (evals)

`triage/eval_cases.json` holds 16 CloudTrail events, each hand-labeled with the severity a person would give it. `python -m triage.evals` runs the AI on all of them and scores the results. Every logged run is recorded in [`triage/EVAL_LOG.md`](triage/EVAL_LOG.md) with the model and a fingerprint of the prompt, so changes can be traced.

Latest results (claude-haiku-4-5):

| Setup                       | Exact match | Within one level |
| --------------------------- | ----------- | ---------------- |
| Event only                  | 13/16 (81%) | 15/16 (94%)      |
| Event plus related activity | 8/16 (50%)  | 13/16 (81%)      |

Adding related activity currently makes results worse. The cause hasn't been investigated yet. With only 16 cases, one case changes the score by about 6 points.

## Tech

- **TypeScript and Node.js** for log intake and the Findings API (Fastify)
- **Python** for the AI triage step and its evals
- **Claude** (Anthropic API) with structured output, checked against a schema
- **PostgreSQL** for storage, run locally with Docker Compose
- **React and Vite** for the analyst screen
- **JWT** (jose) for API sign-in tokens
- **Vitest** for TypeScript tests, including database tests against a separate test database
- **GitHub Actions** to run the tests on every push
- **AWS** (Lambda, SQS, S3) and **Terraform** for hosting (planned)

## Project layout

```
samples/         Sample CloudTrail events used for development and tests
src/ingest/      Log intake and cleanup
src/db/          Database connection and queries
src/api/         Findings API
src/auth/        Sign-in tokens
db/migrations/   Database tables, applied in number order
triage/          AI triage step, evals and eval log (Python)
web/             Analyst screen (React)
tests/           TypeScript tests (tests/integration/ needs the database)
infra/           Terraform files (coming)
```

## Running it locally

Requires Node.js 24, Python 3.13, and Docker.

**1. Settings.** Copy `.env.example` to `.env` and fill in the values. Create `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**2. Database.** Start Postgres (on port 5433) and create the tables:

```powershell
docker compose up -d
Get-ChildItem db/migrations/*.sql | ForEach-Object { Get-Content $_ | docker compose exec -T db psql -U triage -d triage -v ON_ERROR_STOP=1 }
```

On macOS or Linux, the second line is:

```bash
for f in db/migrations/*.sql; do docker compose exec -T db psql -U triage -d triage -v ON_ERROR_STOP=1 < "$f"; done
```

**3. Load events and run the triage.**

```bash
npm install
npm run ingest
python -m venv .venv          # then activate it
pip install -r requirements.txt
python -m triage.run --limit 10
```

**4. Start the API and the analyst screen** (in two terminals):

```bash
npm run api
```

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. To sign in, create a token and paste it in:

```bash
npm run token -- analyst-1 "Your Name"
```

**Tests**

```bash
npm test              # unit tests
npm run test:db       # database tests (needs the database running)
python -m triage.evals
```

## About the sample data

The events in `samples/` are made up for development. The IP addresses (198.51.100.x and 203.0.113.x) and the AWS account number (123456789012) are reserved for documentation, so they don't point to any real person or account.

## License

MIT
