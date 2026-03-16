#!/usr/bin/env python3
"""Podcast Prep Agent — build a research brief for any guest and topic.

Uses BrowseAI's async SDK with sessions to research a podcast guest,
then exports a formatted brief with verified facts, contradictions,
and suggested questions.

Usage:
    python prep.py "Elon Musk" "Mars colonization"
    python prep.py "Yann LeCun" "open-source AI" --depth thorough
    python prep.py "Elon Musk" "Mars colonization" --recall "SpaceX funding"
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

from browseaidev import AsyncBrowseAIDev
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.markdown import Markdown

console = Console()

# ── Research queries ────────────────────────────────────────────────

def build_queries(guest: str, topic: str) -> list[dict[str, str]]:
    """Return the five research passes with labels."""
    return [
        {
            "label": "Guest Background",
            "query": f"Who is {guest}? Background, career, and areas of expertise",
        },
        {
            "label": "Guest on Topic",
            "query": f"{guest}'s views and notable statements on {topic}",
        },
        {
            "label": "Latest Developments",
            "query": f"Latest developments and breaking news in {topic} 2024-2025",
        },
        {
            "label": "Controversies",
            "query": f"Controversial opinions and debates about {topic}",
        },
        {
            "label": "Misconceptions",
            "query": f"Common misconceptions and myths about {topic}",
        },
    ]


# ── Research engine ─────────────────────────────────────────────────

async def run_research(
    client: AsyncBrowseAIDev,
    guest: str,
    topic: str,
    depth: str,
) -> dict:
    """Run all five research passes inside a session, return structured data."""

    session_name = f"podcast-{guest.lower().replace(' ', '-')}-{topic.lower().replace(' ', '-')}"
    session = await client.session(session_name)

    console.print(
        Panel(
            f"[bold]Session:[/bold] {session.name}\n"
            f"[bold]ID:[/bold] {session.id}",
            title="Research Session Created",
            border_style="green",
        )
    )

    queries = build_queries(guest, topic)
    results = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        tasks = []
        for q in queries:
            task_id = progress.add_task(f"Researching: {q['label']}...", total=None)
            tasks.append((q, task_id))

        # Run all research passes concurrently
        async def research_one(q: dict, task_id) -> tuple[str, object]:
            result = await session.ask(q["query"], depth=depth)
            progress.update(task_id, description=f"[green]Done:[/green] {q['label']}")
            progress.stop_task(task_id)
            return q["label"], result

        completed = await asyncio.gather(
            *[research_one(q, tid) for q, tid in tasks]
        )

    for label, result in completed:
        results[label] = result

    return {
        "session": session,
        "results": results,
        "guest": guest,
        "topic": topic,
    }


# ── Brief builder ──────────────────────────────────────────────────

def collect_all_sources(results: dict) -> list[dict]:
    """Deduplicate sources across all research passes."""
    seen_urls = set()
    sources = []
    for result in results.values():
        for src in result.sources:
            if src.url not in seen_urls:
                seen_urls.add(src.url)
                sources.append({"url": src.url, "title": src.title, "domain": src.domain})
    return sources


def collect_contradictions(results: dict) -> list[dict]:
    """Gather all contradictions from every research pass."""
    contradictions = []
    for label, result in results.items():
        if result.contradictions:
            for c in result.contradictions:
                contradictions.append({
                    "claim_a": c.claim_a,
                    "claim_b": c.claim_b,
                    "topic": c.topic,
                    "found_in": label,
                })
    return contradictions


def generate_questions(results: dict, contradictions: list[dict]) -> list[str]:
    """Derive interview questions from contradictions and low-confidence claims."""
    questions = []

    # Questions from contradictions
    for c in contradictions:
        questions.append(
            f"There seems to be a tension between the idea that \"{c['claim_a']}\" "
            f"and \"{c['claim_b']}\" — how do you reconcile these?"
        )

    # Questions from low-confidence claims (< 0.6)
    for label, result in results.items():
        for claim in result.claims:
            score = claim.verification_score
            if score is not None and score < 0.6:
                questions.append(
                    f"Some sources suggest that \"{claim.claim}\" — "
                    f"what's your take on this? (confidence: {score:.0%})"
                )

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    return unique[:10]  # Cap at 10 questions


def build_brief_markdown(data: dict) -> str:
    """Build the full research brief as a markdown string."""
    guest = data["guest"]
    topic = data["topic"]
    results = data["results"]
    session = data["session"]

    lines = []
    lines.append(f"# Podcast Prep Brief: {guest} on {topic}")
    lines.append("")
    lines.append(f"*Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} "
                 f"| Session: `{session.name}` (`{session.id}`)*")
    lines.append("")

    # ── Guest Bio ──
    lines.append("## Guest Bio")
    lines.append("")
    bg = results.get("Guest Background")
    if bg:
        lines.append(bg.answer)
        lines.append("")
        if bg.claims:
            lines.append("**Verified facts:**")
            lines.append("")
            for claim in bg.claims:
                verified = "V" if claim.verified else "?"
                score = f" ({claim.verification_score:.0%})" if claim.verification_score is not None else ""
                lines.append(f"- [{verified}] {claim.claim}{score}")
            lines.append("")

    # ── Topic Overview ──
    lines.append("## Topic Overview")
    lines.append("")
    for label in ["Guest on Topic", "Latest Developments"]:
        result = results.get(label)
        if result:
            lines.append(f"### {label}")
            lines.append("")
            lines.append(result.answer)
            lines.append("")

    # ── Key Talking Points ──
    lines.append("## Key Talking Points")
    lines.append("")
    lines.append("| # | Talking Point | Confidence | Sources |")
    lines.append("|---|--------------|------------|---------|")
    point_num = 0
    for label in ["Guest on Topic", "Controversies", "Misconceptions"]:
        result = results.get(label)
        if result:
            for claim in result.claims:
                point_num += 1
                conf = f"{result.confidence:.0%}" if result.confidence else "N/A"
                src_count = len(claim.sources)
                lines.append(f"| {point_num} | {claim.claim} | {conf} | {src_count} |")
    lines.append("")

    # ── Contradictions ──
    contradictions = collect_contradictions(results)
    lines.append("## Interesting Contradictions")
    lines.append("")
    if contradictions:
        lines.append("*These make great discussion prompts during the interview.*")
        lines.append("")
        for i, c in enumerate(contradictions, 1):
            lines.append(f"### Contradiction {i}: {c['topic']}")
            lines.append("")
            lines.append(f"- **View A:** {c['claim_a']}")
            lines.append(f"- **View B:** {c['claim_b']}")
            lines.append(f"- *Found in: {c['found_in']}*")
            lines.append("")
    else:
        lines.append("No contradictions detected across sources.")
        lines.append("")

    # ── Suggested Questions ──
    questions = generate_questions(results, contradictions)
    lines.append("## Suggested Questions")
    lines.append("")
    if questions:
        for i, q in enumerate(questions, 1):
            lines.append(f"{i}. {q}")
        lines.append("")
    else:
        lines.append("No specific questions generated — all claims are high-confidence.")
        lines.append("")

    # ── Sources Bibliography ──
    all_sources = collect_all_sources(results)
    lines.append("## Sources Bibliography")
    lines.append("")
    for i, src in enumerate(all_sources, 1):
        lines.append(f"{i}. [{src['title']}]({src['url']}) — *{src['domain']}*")
    lines.append("")

    # ── Footer ──
    lines.append("---")
    lines.append("")
    lines.append(f"*Session `{session.id}` is still active. "
                 f"Use `session.recall(\"any fact\")` to look up details during the podcast.*")

    return "\n".join(lines)


# ── Terminal display ────────────────────────────────────────────────

def display_brief(data: dict) -> None:
    """Print a rich summary to the terminal."""
    results = data["results"]
    guest = data["guest"]
    topic = data["topic"]

    console.print()
    console.rule(f"[bold blue]Podcast Prep: {guest} on {topic}[/bold blue]")
    console.print()

    # Confidence overview table
    table = Table(title="Research Pass Results")
    table.add_column("Pass", style="cyan")
    table.add_column("Confidence", justify="center")
    table.add_column("Claims", justify="center")
    table.add_column("Sources", justify="center")
    table.add_column("Contradictions", justify="center")

    for label, result in results.items():
        conf_pct = f"{result.confidence:.0%}"
        if result.confidence >= 0.8:
            conf_str = f"[green]{conf_pct}[/green]"
        elif result.confidence >= 0.6:
            conf_str = f"[yellow]{conf_pct}[/yellow]"
        else:
            conf_str = f"[red]{conf_pct}[/red]"

        contra_count = len(result.contradictions) if result.contradictions else 0
        contra_str = f"[red]{contra_count}[/red]" if contra_count > 0 else "0"

        table.add_row(
            label,
            conf_str,
            str(len(result.claims)),
            str(len(result.sources)),
            contra_str,
        )

    console.print(table)
    console.print()

    # Contradictions highlight
    contradictions = collect_contradictions(results)
    if contradictions:
        console.print(Panel(
            "\n".join(
                f"[bold]{c['topic']}:[/bold]\n"
                f"  A: {c['claim_a']}\n"
                f"  B: {c['claim_b']}\n"
                for c in contradictions
            ),
            title="[red]Contradictions Found[/red]",
            border_style="red",
        ))
        console.print()

    # Suggested questions
    questions = generate_questions(results, contradictions)
    if questions:
        console.print(Panel(
            "\n".join(f"  {i}. {q}" for i, q in enumerate(questions, 1)),
            title="[yellow]Suggested Questions[/yellow]",
            border_style="yellow",
        ))
        console.print()


# ── Recall mode ─────────────────────────────────────────────────────

async def recall_fact(client: AsyncBrowseAIDev, session_id: str, query: str) -> None:
    """Look up a specific fact from an existing session."""
    session = await client.get_session(session_id)

    console.print(f"\n[bold]Recalling from session:[/bold] {session.name}\n")

    result = await session.recall(query)

    if not result.entries:
        console.print("[yellow]No matching knowledge found in session.[/yellow]")
        return

    table = Table(title=f"Recall: \"{query}\"")
    table.add_column("Claim", style="white", max_width=80)
    table.add_column("Confidence", justify="center")
    table.add_column("Verified", justify="center")
    table.add_column("Sources", justify="center")

    for entry in result.entries:
        verified_str = "[green]Yes[/green]" if entry.verified else "[red]No[/red]"
        conf_str = f"{entry.confidence:.0%}" if entry.confidence else "N/A"
        table.add_row(
            entry.claim,
            conf_str,
            verified_str,
            str(len(entry.sources)),
        )

    console.print(table)


# ── Main ────────────────────────────────────────────────────────────

async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Podcast Prep Agent — build a research brief for any guest and topic",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            '  python prep.py "Elon Musk" "Mars colonization"\n'
            '  python prep.py "Yann LeCun" "open-source AI" --depth thorough\n'
            '  python prep.py --recall "SpaceX timeline" --session-id abc-123\n'
        ),
    )
    parser.add_argument("guest", nargs="?", help="Guest name")
    parser.add_argument("topic", nargs="?", help="Interview topic")
    parser.add_argument(
        "--depth", choices=["fast", "thorough"], default="fast",
        help="Research depth: 'fast' (default) or 'thorough' (retries low-confidence queries)",
    )
    parser.add_argument(
        "--api-key", default=os.getenv("BROWSEAI_API_KEY", "bai_xxx"),
        help="BrowseAI API key (default: $BROWSEAI_API_KEY or bai_xxx)",
    )
    parser.add_argument(
        "--output", "-o", default=None,
        help="Output file path (default: brief-{guest}-{topic}.md)",
    )
    parser.add_argument(
        "--recall", default=None,
        help="Recall a fact from an existing session instead of running full research",
    )
    parser.add_argument(
        "--session-id", default=None,
        help="Session ID for --recall mode",
    )

    args = parser.parse_args()

    async with AsyncBrowseAIDev(api_key=args.api_key) as client:

        # ── Recall mode ──
        if args.recall:
            if not args.session_id:
                console.print("[red]Error: --session-id is required for --recall[/red]")
                sys.exit(1)
            await recall_fact(client, args.session_id, args.recall)
            return

        # ── Full research mode ──
        if not args.guest or not args.topic:
            parser.error("guest and topic are required (unless using --recall)")

        console.print(Panel(
            f"[bold]Guest:[/bold] {args.guest}\n"
            f"[bold]Topic:[/bold] {args.topic}\n"
            f"[bold]Depth:[/bold] {args.depth}",
            title="Podcast Prep Agent",
            border_style="blue",
        ))

        data = await run_research(client, args.guest, args.topic, args.depth)

        # Display in terminal
        display_brief(data)

        # Export markdown
        brief_md = build_brief_markdown(data)

        slug_guest = args.guest.lower().replace(" ", "-")
        slug_topic = args.topic.lower().replace(" ", "-")
        output_path = args.output or f"brief-{slug_guest}-{slug_topic}.md"

        Path(output_path).write_text(brief_md)
        console.print(
            f"\n[green bold]Brief exported:[/green bold] {output_path}"
        )
        console.print(
            f"[dim]Session ID: {data['session'].id} — use --recall to look up facts later[/dim]\n"
        )


if __name__ == "__main__":
    asyncio.run(main())
