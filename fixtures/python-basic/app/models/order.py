"""注文。同じパッケージの User を相対 import する。"""
from dataclasses import dataclass, field

from .user import User


@dataclass
class Order:
    user: User
    items: list[tuple[str, int]] = field(default_factory=list)
    total: int = 0
