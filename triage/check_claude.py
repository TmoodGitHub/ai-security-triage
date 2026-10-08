import json 
from pathlib import Path

import anthropic 
from dotenv import load_dotenv

load_dotenv()

sample_path = Path("samples/cloudtrail_sample.json")
events = json.loads(sample_path.read_text())["Records"]
failed_login = events[3]

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=300,
    messages=[
        {
            "role": "user",
            "content": "In two sentences, explain what happened in this AWS CloudTrail event "
            "and whether it looks suspicious:\n\n" + json.dumps(failed_login, indent=2),
        }
    ]
)

print(response.content[0].text)
print()
print(f"Tokens used: {response.usage.input_tokens} in, {response.usage.output_tokens} out")