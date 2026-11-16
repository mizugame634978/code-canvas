"""通知。括弧で複数行にまたがる import と、関数内の遅延 import を使う。"""
from app.utils.formatting import (
    money,
    today,
)


def notify_created(order) -> None:
    # 循環参照を避けるための関数内 import（orders -> notify の逆向き）
    from app.services.orders import OrderService  # noqa: F401

    print(f"[{today()}] {order.user.name} さんの注文を受け付けました: {money(order.total)}")
