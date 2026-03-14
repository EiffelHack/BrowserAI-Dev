#!/usr/bin/env python3
"""Debate Settler — Research two opposing claims and declare a winner based on evidence.

Usage:
    python settle.py "Python is faster than JavaScript" "JavaScript is faster than Python"
    python settle.py  # Interactive mode — prompts for claims
    BROWSEAI_API_KEY=bai_xxx python settle.py "claim A" "claim B"
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from browseai import BrowseAI
from browseai.models import BrowseResult
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text


console = Console()


# ── Helpers ──────────────────────────────────────────────────────────────────


def get_api_key() -> str:
    """Resolve API key from env or prompt."""
    key = os.environ.get("BROWSEAI_API_KEY", "")
    if key:
        return key
    console.print(
        "[dim]Tip: set BROWSEAI_API_KEY env var to skip this prompt.[/dim]"
    )
    key = console.input("[bold]Enter your BrowseAI API key:[/bold] ").strip()
    if not key:
        console.print("[red]No API key provided. Exiting.[/red]")
        sys.exit(1)
    return key


def research_claim(client: BrowseAI, claim: str, label: str) -> BrowseResult:
    """Research a single claim using thorough mode."""
    console.print(f"\n[bold blue]Researching {label}:[/bold blue] {claim}")
    with console.status(f"[bold green]Searching & verifying {label}...[/bold green]"):
        start = time.time()
        result = client.ask(claim, depth="thorough")
        elapsed = time.time() - start
    console.print(f"[dim]  Done in {elapsed:.1f}s[/dim]")
    return result


def count_verified(result: BrowseResult) -> int:
    """Count claims that passed verification."""
    return sum(1 for c in result.claims if c.verified)


def confidence_bar(score: float, width: int = 20) -> Text:
    """Render a colored progress bar for confidence."""
    filled = int(score * width)
    if score >= 0.7:
        color = "green"
    elif score >= 0.4:
        color = "yellow"
    else:
        color = "red"
    bar = Text()
    bar.append("█" * filled, style=color)
    bar.append("░" * (width - filled), style="dim")
    bar.append(f" {score:.0%}", style=f"bold {color}")
    return bar


# ── Display ──────────────────────────────────────────────────────────────────


def show_side_by_side(
    claim_a: str,
    claim_b: str,
    result_a: BrowseResult,
    result_b: BrowseResult,
) -> None:
    """Render a side-by-side comparison table."""
    table = Table(
        title="Evidence Comparison",
        show_header=True,
        header_style="bold magenta",
        expand=True,
        padding=(0, 1),
    )
    table.add_column("Metric", style="bold", width=22)
    table.add_column("Side A", justify="center", ratio=1)
    table.add_column("Side B", justify="center", ratio=1)

    # Confidence
    table.add_row(
        "Confidence",
        confidence_bar(result_a.confidence),
        confidence_bar(result_b.confidence),
    )

    # Sources
    src_a = len(result_a.sources)
    src_b = len(result_b.sources)
    table.add_row(
        "Sources found",
        Text(str(src_a), style="bold green" if src_a >= src_b else "dim"),
        Text(str(src_b), style="bold green" if src_b >= src_a else "dim"),
    )

    # Verified claims
    ver_a = count_verified(result_a)
    ver_b = count_verified(result_b)
    total_a = len(result_a.claims)
    total_b = len(result_b.claims)
    table.add_row(
        "Verified claims",
        Text(
            f"{ver_a}/{total_a}",
            style="bold green" if ver_a >= ver_b else "dim",
        ),
        Text(
            f"{ver_b}/{total_b}",
            style="bold green" if ver_b >= ver_a else "dim",
        ),
    )

    # Domain diversity
    domains_a = len({s.domain for s in result_a.sources})
    domains_b = len({s.domain for s in result_b.sources})
    table.add_row(
        "Unique domains",
        Text(str(domains_a), style="bold green" if domains_a >= domains_b else "dim"),
        Text(str(domains_b), style="bold green" if domains_b >= domains_a else "dim"),
    )

    # Contradictions found
    contra_a = len(result_a.contradictions) if result_a.contradictions else 0
    contra_b = len(result_b.contradictions) if result_b.contradictions else 0
    table.add_row(
        "Contradictions",
        Text(str(contra_a), style="red" if contra_a > 0 else "green"),
        Text(str(contra_b), style="red" if contra_b > 0 else "green"),
    )

    console.print()
    console.print(
        Panel(f"[bold cyan]A:[/bold cyan] {claim_a}", border_style="cyan")
    )
    console.print(
        Panel(f"[bold yellow]B:[/bold yellow] {claim_b}", border_style="yellow")
    )
    console.print()
    console.print(table)


def show_answer_summary(label: str, color: str, result: BrowseResult) -> None:
    """Show the research answer for one side."""
    console.print(
        Panel(
            result.answer,
            title=f"{label} — Research Summary",
            border_style=color,
            padding=(1, 2),
        )
    )


def show_key_claims(label: str, color: str, result: BrowseResult) -> None:
    """List the verified claims for one side."""
    verified = [c for c in result.claims if c.verified]
    if not verified:
        return
    console.print(f"\n[bold {color}]{label} — Verified Claims:[/bold {color}]")
    for i, c in enumerate(verified, 1):
        level = c.consensus_level or "unknown"
        style = "green" if level == "high" else "yellow" if level == "medium" else "dim"
        console.print(
            f"  [{style}]{i}. {c.claim}[/{style}] "
            f"[dim](consensus: {level}, sources: {len(c.sources)})[/dim]"
        )


def show_contradictions(result_a: BrowseResult, result_b: BrowseResult) -> None:
    """Show contradictions found within and across both sides."""
    all_contradictions = []
    if result_a.contradictions:
        all_contradictions.extend(result_a.contradictions)
    if result_b.contradictions:
        all_contradictions.extend(result_b.contradictions)

    if not all_contradictions:
        console.print("\n[green]No contradictions detected in either side.[/green]")
        return

    # Deduplicate by topic
    seen = set()
    unique = []
    for c in all_contradictions:
        key = (c.topic, c.claim_a, c.claim_b)
        if key not in seen:
            seen.add(key)
            unique.append(c)

    console.print(
        f"\n[bold red]Contradictions Found ({len(unique)}):[/bold red]"
    )
    for c in unique:
        console.print(
            Panel(
                f"[cyan]Claim:[/cyan] {c.claim_a}\n"
                f"[yellow]vs:[/yellow]   {c.claim_b}",
                title=f"Topic: {c.topic}",
                border_style="red",
                padding=(0, 2),
            )
        )


def compute_score(result: BrowseResult) -> float:
    """Compute a composite evidence strength score (0-100)."""
    confidence_pts = result.confidence * 40  # max 40
    source_pts = min(len(result.sources) / 10, 1.0) * 20  # max 20
    verified = count_verified(result)
    total = len(result.claims) or 1
    verify_pts = (verified / total) * 20  # max 20
    domain_pts = min(len({s.domain for s in result.sources}) / 8, 1.0) * 15  # max 15
    contra_penalty = min(
        (len(result.contradictions) if result.contradictions else 0) * 3, 15
    )  # max -15
    contra_pts = 5 - contra_penalty  # base 5, penalized
    return max(0, confidence_pts + source_pts + verify_pts + domain_pts + contra_pts)


def declare_winner(
    claim_a: str,
    claim_b: str,
    result_a: BrowseResult,
    result_b: BrowseResult,
) -> None:
    """Declare a winner based on composite evidence score."""
    score_a = compute_score(result_a)
    score_b = compute_score(result_b)

    console.print("\n")
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(justify="right", style="bold")
    table.add_column(justify="left")
    table.add_row("Side A score:", f"{score_a:.1f} / 100")
    table.add_row("Side B score:", f"{score_b:.1f} / 100")
    console.print(table)

    console.print()
    if abs(score_a - score_b) < 3:
        console.print(
            Panel(
                "[bold yellow]TOO CLOSE TO CALL[/bold yellow]\n\n"
                "Both sides have roughly equal evidence. "
                "The truth likely involves nuance that a simple yes/no cannot capture.",
                title="VERDICT",
                border_style="yellow",
                padding=(1, 2),
            )
        )
    elif score_a > score_b:
        console.print(
            Panel(
                f"[bold green]SIDE A WINS[/bold green] "
                f"by {score_a - score_b:.1f} points\n\n"
                f'[cyan]"{claim_a}"[/cyan]\n\n'
                f"has stronger evidence support based on source quality, "
                f"verification rate, and cross-source consensus.",
                title="VERDICT",
                border_style="green",
                padding=(1, 2),
            )
        )
    else:
        console.print(
            Panel(
                f"[bold green]SIDE B WINS[/bold green] "
                f"by {score_b - score_a:.1f} points\n\n"
                f'[cyan]"{claim_b}"[/cyan]\n\n'
                f"has stronger evidence support based on source quality, "
                f"verification rate, and cross-source consensus.",
                title="VERDICT",
                border_style="green",
                padding=(1, 2),
            )
        )


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Settle a debate with evidence. Research two opposing claims and see which one holds up.",
        epilog=(
            "Examples:\n"
            '  python settle.py "Python is faster than JavaScript" "JavaScript is faster than Python"\n'
            '  python settle.py "Coffee is good for health" "Coffee is bad for health"\n'
            '  python settle.py "Remote work increases productivity" "Office work increases productivity"\n'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("claim_a", nargs="?", help="First claim (Side A)")
    parser.add_argument("claim_b", nargs="?", help="Opposing claim (Side B)")
    args = parser.parse_args()

    # Banner
    console.print(
        Panel(
            "[bold]DEBATE SETTLER[/bold]\n"
            "[dim]Powered by BrowseAI — Evidence-backed research[/dim]",
            border_style="bright_blue",
            padding=(1, 4),
        )
    )

    # Get claims (from args or interactively)
    claim_a = args.claim_a
    claim_b = args.claim_b
    if not claim_a:
        claim_a = console.input("\n[bold cyan]Enter Side A claim:[/bold cyan] ").strip()
    if not claim_b:
        claim_b = console.input("[bold yellow]Enter Side B claim:[/bold yellow] ").strip()

    if not claim_a or not claim_b:
        console.print("[red]Both claims are required.[/red]")
        sys.exit(1)

    # Initialize client
    api_key = get_api_key()
    client = BrowseAI(api_key=api_key)

    # Research both sides
    console.rule("[bold]Researching Both Sides[/bold]")
    result_a = research_claim(client, claim_a, "Side A")
    result_b = research_claim(client, claim_b, "Side B")

    # Show results
    console.rule("[bold]Results[/bold]")

    show_answer_summary("Side A", "cyan", result_a)
    show_answer_summary("Side B", "yellow", result_b)

    show_side_by_side(claim_a, claim_b, result_a, result_b)

    show_key_claims("Side A", "cyan", result_a)
    show_key_claims("Side B", "yellow", result_b)

    show_contradictions(result_a, result_b)

    # Verdict
    console.rule("[bold]Verdict[/bold]")
    declare_winner(claim_a, claim_b, result_a, result_b)

    # Source list
    console.print("\n[dim]Sources consulted:[/dim]")
    all_urls = {s.url for s in result_a.sources} | {s.url for s in result_b.sources}
    for url in sorted(all_urls):
        console.print(f"  [dim]{url}[/dim]")

    console.print()


if __name__ == "__main__":
    main()
