"""Admin command line: ``uv run python -m weft.cli <group> <command>``.

invites generate N                print N new invite codes, one per line (AC-41)
invites list                      every code with its state (unused / used / revoked) and user
invites revoke CODE               revoke an unused code (exit 1 if unknown, used or revoked)
seed --user LOGIN [--size N]      write the seed graph (BOT-5 / BOT-9) into LOGIN's empty graph;
                                  --size grows it with generated persons to N (e.g. 300)
embeddings backfill --user LOGIN  embed LOGIN's persons, entities and facts lacking vectors
summaries refresh --user LOGIN    regenerate LOGIN's stale 综合描述 and relationship summaries

Every per-user command runs inside that user's tenant scope, exactly as a request would.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Awaitable, Callable, Sequence

from weft.domain.tenancy import TenantContext, tenant_scope
from weft.infra import Infra, build_infra
from weft.repositories.accounts import UserRepository
from weft.services import embeddings, invites, seed, summaries
from weft.services.results import Err
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

    seed_cmd = groups.add_parser("seed", help="write the seed graph into a user's empty graph")
    seed_cmd.add_argument("--user", required=True, help="login name")
    seed_cmd.add_argument(
        "--size", type=int, default=None, help="grow to N persons with generated ones"
    )
    emb = groups.add_parser("embeddings", help="search embeddings")
    emb_cmds = emb.add_subparsers(dest="command", required=True)
    emb_cmds.add_parser("backfill", help="embed what has no vector").add_argument(
        "--user", required=True, help="login name"
    )
    summ = groups.add_parser("summaries", help="generated summaries")
    summ_cmds = summ.add_subparsers(dest="command", required=True)
    summ_cmds.add_parser("refresh", help="regenerate stale summaries").add_argument(
        "--user", required=True, help="login name"
    )
    return parser


async def _invites(args: argparse.Namespace, infra: Infra) -> int:
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


async def _seed(infra: Infra, size: int | None = None) -> int:
    result = await seed.seed_graph(infra, size=size)
    if isinstance(result, Err):
        print(f"cannot seed: {result.message}", file=sys.stderr)
        return 1
    persons = len(set(result.value.persons.values()))
    print(f"seeded {persons} persons from {len(result.value.entries)} entries")
    return 0


async def _backfill(infra: Infra) -> int:
    done = await embeddings.backfill(infra)
    print(f"embedded {done.nodes} nodes, {done.facts} facts")
    return 0


async def _refresh(infra: Infra) -> int:
    done = await summaries.refresh_stale(infra, limit=1000)
    print(
        f"regenerated {done.persons} persons, {done.relationships} relationships, "
        f"{done.failed} failed"
    )
    return 0 if done.failed == 0 else 1


async def _as_user(infra: Infra, login: str, command: Callable[[Infra], Awaitable[int]]) -> int:
    async with infra.sql() as session:
        found = await UserRepository(session).get_by_username(login)
    if found is None:
        print(f"no such user: {login}", file=sys.stderr)
        return 1
    with tenant_scope(TenantContext.for_user(found[0].id)):
        return await command(infra)


async def run(argv: Sequence[str], *, infra: Infra) -> int:
    args = _parser().parse_args(list(argv))
    if args.group == "invites":
        return await _invites(args, infra)
    per_user: dict[str, Callable[[Infra], Awaitable[int]]] = {
        "seed": lambda i: _seed(i, args.size),
        "embeddings": _backfill,
        "summaries": _refresh,
    }
    return await _as_user(infra, args.user, per_user[args.group])


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
