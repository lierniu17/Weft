"""Admin command line (AC-41): ``uv run python -m weft.cli invites generate|list|revoke``.

invites generate N     print N new invite codes, one per line
invites list           every code with its state (unused / used / revoked) and user
invites revoke CODE    revoke an unused code (exit 1 if unknown, used or revoked)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence

from weft.infra import Infra, build_infra
from weft.services import invites
from weft.settings import get_settings


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m weft.cli")
    groups = parser.add_subparsers(dest="group", required=True)
    inv = groups.add_parser("invites", help="manage invite codes")
    commands = inv.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("generate", help="generate invite codes")
    gen.add_argument("count", type=int)
    commands.add_parser("list", help="list invite codes and their usage")
    rev = commands.add_parser("revoke", help="revoke an unused invite code")
    rev.add_argument("code")
    return parser


async def run(argv: Sequence[str], *, infra: Infra) -> int:
    args = _parser().parse_args(list(argv))
    if args.command == "generate":
        if args.count < 1:
            print("count must be at least 1", file=sys.stderr)
            return 2
        for code in await invites.generate(infra, args.count):
            print(code)
        return 0
    if args.command == "list":
        print(f"{'CODE':<12} {'STATE':<8} {'CREATED':<20} {'USED BY':<20}")
        for invite in await invites.list_all(infra):
            created = invite.created_at.strftime("%Y-%m-%d %H:%M")
            user = invite.used_by_username or ("(deleted account)" if invite.used_at else "-")
            print(f"{invite.code:<12} {invite.status:<8} {created:<20} {user:<20}")
        return 0
    state = await invites.revoke(infra, args.code)
    if state is invites.RevokeState.REVOKED:
        print(f"revoked {args.code}")
        return 0
    print(f"cannot revoke {args.code}: {state.value}", file=sys.stderr)
    return 1


async def _main(argv: Sequence[str]) -> int:
    infra = build_infra(get_settings())
    try:
        return await run(argv, infra=infra)
    finally:
        await infra.aclose()


def main() -> None:
    sys.exit(asyncio.run(_main(sys.argv[1:])))


if __name__ == "__main__":
    main()
