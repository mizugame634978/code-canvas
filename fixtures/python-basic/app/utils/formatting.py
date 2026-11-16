"""表示用の整形。標準ライブラリだけを import する（キャンバスには線が出ないはず）。"""
import datetime

from app.config import CURRENCY


def money(amount: int) -> str:
    return f"{amount:,}{CURRENCY}"


def today() -> str:
    return datetime.date.today().isoformat()
