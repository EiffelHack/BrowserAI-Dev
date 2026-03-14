# Podcast Prep Agent

An AI-powered research agent that builds comprehensive interview briefs for podcast hosts. Give it a guest name and topic, and it produces a structured brief with verified facts, contradictions worth exploring, and suggested questions — all backed by evidence.

## How it works

The agent runs five parallel research passes through BrowseAI:

1. **Guest Background** — Who they are, career, expertise
2. **Guest on Topic** — Their public views and notable statements
3. **Latest Developments** — Recent news and breakthroughs in the topic
4. **Controversies** — Debates and contested claims
5. **Misconceptions** — Common myths and misunderstandings

All research happens inside a BrowseAI **session**, so every fact is stored and can be recalled later (even mid-interview).

The output is a markdown brief with:
- Guest bio with verified facts
- Topic overview from multiple angles
- Key talking points with confidence scores
- Contradictions found across sources (great for sparking discussion)
- Suggested interview questions (derived from contradictions and low-confidence claims)
- Full source bibliography

## Quick start

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export BROWSEAI_API_KEY="bai_xxx"

# Run it
python prep.py "Elon Musk" "Mars colonization"
```

This produces a file `brief-elon-musk-mars-colonization.md` and prints a rich summary to your terminal.

## Example: Prepping for Elon Musk on Mars Colonization

```bash
python prep.py "Elon Musk" "Mars colonization" --depth thorough
```

The agent will research across all five passes concurrently and produce something like:

```
┌─────────────────────────────────┐
│      Podcast Prep Agent         │
│                                 │
│  Guest: Elon Musk               │
│  Topic: Mars colonization       │
│  Depth: thorough                │
└─────────────────────────────────┘

┌──────────────────────────────────────────────┐
│         Research Pass Results                │
├───────────────────┬────────┬───────┬─────────┤
│ Pass              │ Conf.  │Claims │ Sources │
├───────────────────┼────────┼───────┼─────────┤
│ Guest Background  │  92%   │  8    │   6     │
│ Guest on Topic    │  78%   │  6    │   5     │
│ Latest Devs       │  85%   │  7    │   7     │
│ Controversies     │  61%   │  5    │   4     │
│ Misconceptions    │  73%   │  4    │   5     │
└───────────────────┴────────┴───────┴─────────┘

┌─────────── Contradictions Found ─────────────┐
│ Mars timeline:                                │
│   A: SpaceX targets crewed Mars mission by    │
│      2029                                     │
│   B: Independent analysts estimate earliest   │
│      crewed landing around 2035-2040          │
└───────────────────────────────────────────────┘
```

The exported markdown brief has everything structured for quick scanning before you hit record.

## Usage

### Full research

```bash
# Basic — fast mode
python prep.py "Guest Name" "topic"

# Thorough mode — retries low-confidence queries with rephrased searches
python prep.py "Guest Name" "topic" --depth thorough

# Custom output path
python prep.py "Guest Name" "topic" -o my-brief.md
```

### Recall facts during the podcast

After running a prep, the session stays active. Use `--recall` to look up any fact on the fly:

```bash
# Look up a specific detail from your research session
python prep.py --recall "SpaceX funding rounds" --session-id abc-123

# Check a claim the guest just made
python prep.py --recall "Mars radiation levels" --session-id abc-123
```

This queries the session's stored knowledge without making new web searches — instant answers from your existing research.

### Using it in your own code

```python
import asyncio
from browseai import AsyncBrowseAI

async def quick_prep():
    async with AsyncBrowseAI(api_key="bai_xxx") as client:
        session = await client.session("interview-prep")

        # Research in parallel
        results = await asyncio.gather(
            session.ask("Who is Yann LeCun?"),
            session.ask("Yann LeCun's views on open-source AI"),
            session.ask("Open-source AI controversies 2024-2025"),
        )

        for r in results:
            print(f"Confidence: {r.confidence:.0%}")
            print(r.answer[:200])
            print()

        # Later, recall any fact
        recall = await session.recall("LeCun Meta AI")
        for entry in recall.entries:
            print(f"  - {entry.claim}")

asyncio.run(quick_prep())
```

## Output format

The exported brief is a standard markdown file with these sections:

| Section | What's in it |
|---------|-------------|
| Guest Bio | Background summary + individually verified facts |
| Topic Overview | Guest's views + latest developments |
| Key Talking Points | Claims table with confidence scores and source counts |
| Interesting Contradictions | Conflicting claims across sources — great for discussion |
| Suggested Questions | Auto-generated from contradictions and low-confidence claims |
| Sources Bibliography | Every source used, deduplicated, with links |

## Tips

- **Use thorough mode** for important interviews — it automatically retries queries that score below 60% confidence
- **Check contradictions first** — they make the best interview moments
- **Low-confidence claims** are not necessarily wrong; they just have less source agreement, which means they are worth exploring
- **Sessions persist** — you can run the prep days before and still recall facts during the live interview
- **Share your session** — use `session.share()` in code to generate a public link your co-host can review

## Requirements

- Python 3.10+
- BrowseAI API key ([get one here](https://browseai.dev))
